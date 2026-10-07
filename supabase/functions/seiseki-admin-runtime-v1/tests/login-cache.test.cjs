const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function fixture({ level = '4', centralLevel = level, denied = false, failedLogin = false, mismatch = false, invalidExpiry = false } = {}) {
  let handler; const rows = new Map(); const calls = [];
  const m = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fetch = async (url, init) => {
    calls.push({ url: String(url), action: init.body ? JSON.parse(init.body).action : null });
    if (String(url).startsWith('https://script.google.com/')) {
      if (JSON.parse(init.body).action !== 'staffLogin') throw new Error('Unexpected legacy re-verification');
      return Response.json({ success: !failedLogin, code: mismatch ? '7999' : '7001', permissionLevel: level, name: 'Fixture', systemPortalSessionToken: 'fixture-issued-session', systemPortalExpiresAt: invalidExpiry ? 'invalid' : '2100-01-01T00:00:00Z' });
    }
    const u = new URL(url);
    if (!u.pathname.endsWith('/seiseki_admin_sessions')) throw new Error('Unexpected DB request');
    if (init.method === 'POST') { const row = JSON.parse(init.body); rows.set(row.token_hash, row); return new Response(null, { status: 201 }); }
    const key = u.searchParams.get('token_hash').slice(3);
    return Response.json(rows.has(key) ? [rows.get(key)] : []);
  };
  const mocks = {
    './storage.ts': { CORS_HEADERS: {}, preflightResponse: () => null },
    './permission-bridge.ts': { checkPermissionBridge: async () => ({ allowed: !denied, level: centralLevel }) },
  };
  new Function('require', 'module', 'exports', 'Deno', 'fetch', 'EdgeRuntime', source)(
    n => mocks[n], m, m.exports,
    { env: { get: n => n === 'SUPABASE_URL' ? 'https://database.example' : 'fixture-secret' }, serve: h => { handler = h; } },
    fetch, { waitUntil() {} });
  return { rows, calls, async call(body) { const r = await handler(new Request('https://function.example', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; } };
}
test('authenticated staff 7001 can verify an issued session without a second legacy call', async () => {
  const f = fixture(); const login = await f.call({ action: 'staffLogin', code: '7001', password: 'fixture' });
  assert.equal(login.status, 200); assert.equal(f.rows.size, 1);
  assert.equal([...f.rows.values()][0].staff_code, '7001');
  assert.equal([...f.rows.values()][0].token_hash.length, 64);
  assert.notEqual([...f.rows.keys()][0], login.body.systemPortalSessionToken);
  const verified = await f.call({ action: 'verifyStaffSession', token: login.body.systemPortalSessionToken, permissionAppId: 'public-11' });
  assert.equal(verified.status, 200); assert.equal(verified.body.code, '7001'); assert.equal(verified.body.permissionLevel, '4');
  assert.equal(f.calls.filter(c => c.url.startsWith('https://script.google.com/')).length, 1);
});
test('failed credentials, mismatched staff and invalid expiry never create a cached session', async () => {
  for (const options of [{ failedLogin: true }, { mismatch: true }, { invalidExpiry: true }]) {
    const f = fixture(options); const r = await f.call({ action: 'staffLogin', code: '7001', password: 'fixture' });
    assert.equal(r.status, 401); assert.equal(f.rows.size, 0);
  }
});
test('central denial and changed roles remain authoritative after session caching', async () => {
  for (const options of [{ denied: true }, { level: '2', centralLevel: '4' }, { level: '4', centralLevel: '2' }]) {
    const f = fixture(options); const login = await f.call({ action: 'staffLogin', code: '7001', password: 'fixture' });
    const result = await f.call({ action: 'verifyStaffSession', token: login.body.systemPortalSessionToken, permissionAppId: 'public-11' });
    assert.equal(result.status, options.denied ? 403 : 200);
    if (!options.denied) assert.equal(result.body.permissionLevel, options.centralLevel);
  }
});
test('level 1 retains grade-only token and never exposes a management token', async () => {
  const f = fixture({ level: '1' }); const r = await f.call({ action: 'staffLogin', code: '7001', password: 'fixture' });
  assert.equal(r.status, 200); assert.equal(r.body.systemPortalSessionToken, ''); assert.match(r.body.gradeSessionToken, /^seiseki-grade:/);
  assert.equal([...f.rows.values()][0].permission_level, '1');
});
