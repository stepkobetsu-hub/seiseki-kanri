import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('./supabase/functions/seiseki-admin-runtime-v1/index.ts', import.meta.url), 'utf8');
function runtime(upstream = { success:true, code:'test-staff', name:'Test', permissionLevel:'1' }) {
  const rows = new Map();
  const calls = [];
  let handler;
  const context = vm.createContext({
    URL, Response, Request, crypto:webcrypto, TextEncoder, console,
    CORS_HEADERS:{}, preflightResponse:() => null,
    Deno:{ env:{ get:name => name === 'SUPABASE_URL' ? 'https://test.supabase.co' : 'test-env' }, serve:fn => { handler = fn; } },
    EdgeRuntime:{ waitUntil:() => {} },
    fetch:async (url, init={}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : {};
      calls.push({ url, body });
      if (parsed.hostname === 'script.google.com') {
        if (body.action === 'staffLogin') return Response.json(upstream);
        if (body.action === 'verifySystemPortal') return Response.json(upstream);
        return Response.json({ success:true });
      }
      if (parsed.pathname.endsWith('/seiseki_admin_sessions')) {
        const key = (parsed.searchParams.get('token_hash') || '').replace(/^eq\./, '');
        if (init.method === 'POST') { rows.set(body.token_hash, body); return Response.json(null); }
        if (init.method === 'DELETE') { rows.delete(key); return Response.json(null); }
        if (init.method === 'PATCH') { Object.assign(rows.get(key), body); return Response.json(null); }
        return Response.json(rows.has(key) ? [rows.get(key)] : []);
      }
      return Response.json([]);
    },
  });
  vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*;\r?\n/, ''), {mode:'transform'}), context);
  return { rows, calls, request:async body => {
    const response = await handler(new Request('https://test/api', {method:'POST', body:JSON.stringify(body)}));
    return { status:response.status, body:await response.json() };
  } };
}
async function login(r) {
  const result = await r.request({action:'staffLogin', code:'test-staff', password:'synthetic-test-password'});
  assert.equal(result.status, 200);
  return result.body;
}

test('level 1 receives only a random grade token; database stores only its hash', async () => {
  const r = runtime();
  const staff = await login(r);
  assert.match(staff.gradeSessionToken, /^seiseki-grade:/);
  assert.equal(staff.systemPortalSessionToken, '');
  const row = [...r.rows.values()][0];
  assert.equal(row.staff_code, 'test-staff');
  assert.equal(row.permission_level, '1');
  assert.match(row.token_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(row).includes('synthetic-test-password'));
  assert.ok(!JSON.stringify(row).includes(staff.gradeSessionToken));
});
test('level 1 can enter and read grades, reports, preferences and meeting memos', async () => {
  const r = runtime();
  const staff = await login(r);
  for (const action of ['verifyStaffSession','getStudents','getAllScores','getAllReports','getAllWishes','getMeetingMemos','getStaffMembers']) {
    const result = await r.request({action, token:staff.gradeSessionToken});
    assert.equal(result.status, 200, action);
  }
});
test('level 1 writes reach normal mutation validation', async () => {
  const r = runtime();
  const staff = await login(r);
  for (const action of ['saveScore','deleteScore','saveReport','deleteReport','saveWish','saveMeetingMemo']) {
    const result = await r.request({action, token:staff.gradeSessionToken});
    assert.equal(result.status, 400, action);
    assert.equal(result.body.code, 'MUTATION_ID_REQUIRED');
  }
});
test('level 1 cannot read/edit private directory data or change synchronization', async () => {
  const r = runtime();
  const staff = await login(r);
  for (const action of ['syncStudentDirectory','getStudentDirectoryDetail','saveStudentDirectory','enableStudentDirectoryAutoSync']) {
    const result = await r.request({action, token:staff.gradeSessionToken, permissionLevel:'4'});
    assert.equal(result.status, 403, action);
    assert.equal(result.body.code, 'APP_FORBIDDEN');
  }
});
test('unknown and expired grade tokens are rejected without portal fallback', async () => {
  const r = runtime();
  const staff = await login(r);
  [...r.rows.values()][0].expires_at = '2000-01-01T00:00:00Z';
  for (const token of ['seiseki-grade:forged',staff.gradeSessionToken,'']) {
    assert.equal((await r.request({action:'verifyStaffSession',token})).status, 401);
  }
  assert.equal(r.calls.filter(c => c.body.action === 'verifySystemPortal').length, 0);
});
test('persistent grade sessions are revocable by explicit logout', async () => {
  const r = runtime();
  const staff = await login(r);
  assert.equal((await r.request({action:'persistAdminSession',token:staff.gradeSessionToken})).status, 200);
  assert.equal([...r.rows.values()][0].expires_at, '2100-01-01T00:00:00.000Z');
  assert.equal((await r.request({action:'logoutAdmin',token:staff.gradeSessionToken})).status, 200);
  assert.equal(r.rows.size, 0);
  assert.equal((await r.request({action:'verifyStaffSession',token:staff.gradeSessionToken})).status, 401);
  assert.equal(r.calls.filter(c => c.body.action === 'logoutSystemPortal').length, 0);
});
test('level 0 and upstream login failures cannot create sessions', async () => {
  for (const upstream of [
    {success:true, code:'test-staff', permissionLevel:'0'},
    {success:false, error:'Invalid password'},
    {success:true, code:'different-staff', permissionLevel:'1'},
  ]) {
    const r = runtime(upstream);
    assert.equal((await r.request({action:'staffLogin',code:'test-staff',password:'synthetic-test-password'})).status, 401);
    assert.equal(r.rows.size, 0);
  }
});
test('level 2 keeps the existing manager session and can access directory actions', async () => {
  const r = runtime({success:true, code:'test-staff', permissionLevel:'2', systemPortalSessionToken:'manager-test-token'});
  const staff = await login(r);
  assert.equal(staff.systemPortalSessionToken, 'manager-test-token');
  assert.equal(staff.gradeSessionToken, undefined);
  const result = await r.request({action:'getStudentDirectoryDetail',token:staff.systemPortalSessionToken,studentId:'1000'});
  assert.equal(result.status, 200);
});
test('grade-scoped sessions cannot grant directory access even with a higher stored level', async () => {
  const r = runtime();
  const staff = await login(r);
  [...r.rows.values()][0].permission_level = '4';
  assert.equal((await r.request({action:'getStudentDirectoryDetail',token:staff.gradeSessionToken})).status, 403);
});
test('all three entrances use the shared verified authentication client', () => {
  for (const path of ['index.html','admin.html','meeting_memo.html']) {
    const page = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(page, /src="assets\/js\/staff-auth.js\?v=20261004"/);
    assert.match(page, /StepStaffAuth\.login\(/);
  }
});
