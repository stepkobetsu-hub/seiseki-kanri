#!/usr/bin/env node
/*
  Supabase RLS smoke test.

  Required:
    SUPABASE_URL
    SUPABASE_ANON_KEY

  Optional:
    ADMIN_EMAIL
    ADMIN_PASSWORD
    NON_ADMIN_EMAIL
    NON_ADMIN_PASSWORD
*/

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY are required.');
  process.exit(1);
}

const base = SUPABASE_URL.replace(/\/$/, '');
const tables = ['students', 'test_scores', 'report_cards', 'meeting_memos', 'school_preferences'];

async function signIn(email, password) {
  if (!email || !password) return { token: null, ok: false, status: null, message: 'email or password missing' };
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch(e) { body = text; }
  if (!res.ok) {
    const message = typeof body === 'object' && body ? (body.msg || body.message || body.error_description || JSON.stringify(body)) : String(body || '');
    return { token: null, ok: false, status: res.status, message: message.slice(0, 180) };
  }
  return { token: body.access_token || null, ok: true, status: res.status, message: body.user?.email || 'signed in' };
}

async function canRead(table, token) {
  const url = new URL(`${base}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', '1');
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token || ANON_KEY}`,
      Prefer: 'count=exact'
    }
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch(e) { body = text; }
  const rowCount = Array.isArray(body) ? body.length : null;
  return {
    ok: res.ok,
    status: res.status,
    rowCount,
    bodyPreview: typeof body === 'string' ? body.slice(0, 160) : JSON.stringify(body).slice(0, 160)
  };
}

async function canInsertStudent(actor, token) {
  const code = `RLS_${actor}_${Date.now()}`.replace(/[^A-Z0-9_]/gi, '_');
  const res = await fetch(`${base}/rest/v1/students`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token || ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      student_code: code,
      name: 'RLS Test Student',
      campus: '神領校',
      grade: '中1',
      school_name: 'RLS Test School',
      active: true
    })
  });
  const text = await res.text();
  if (res.ok && token) {
    await fetch(`${base}/rest/v1/students?student_code=eq.${code}`, {
      method: 'DELETE',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`
      }
    }).catch(() => {});
  }
  return {
    actor,
    table: 'students',
    operation: 'insert',
    ok: res.ok,
    status: res.status,
    bodyPreview: text.slice(0, 160)
  };
}

const adminAuth = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
const nonAdminAuth = await signIn(process.env.NON_ADMIN_EMAIL, process.env.NON_ADMIN_PASSWORD);
const adminToken = adminAuth.token;
const nonAdminToken = nonAdminAuth.token;
const results = [];
results.push({
  actor: 'admin',
  table: 'auth',
  operation: 'sign_in',
  expected: 'signed in',
  ok: adminAuth.ok,
  status: adminAuth.status,
  rowCount: null,
  bodyPreview: adminAuth.message
});

for (const table of tables) {
  results.push({ actor: 'anon', table, operation: 'select', expected: table === 'students' ? '0 rows' : '0 rows or no visible rows', ...(await canRead(table, null)) });
  if (adminToken) results.push({ actor: 'admin', table, operation: 'select', expected: table === 'students' ? 'TEST rows visible' : 'allowed if rows exist', ...(await canRead(table, adminToken)) });
  if (nonAdminToken) results.push({ actor: 'non_admin', table, operation: 'select', expected: '0 rows', ...(await canRead(table, nonAdminToken)) });
}

results.push({ expected: 'blocked', ...(await canInsertStudent('anon', null)) });
if (adminToken) results.push({ expected: 'allowed then cleaned up', ...(await canInsertStudent('admin', adminToken)) });
if (nonAdminToken) results.push({ expected: 'blocked', ...(await canInsertStudent('non_admin', nonAdminToken)) });

const judged = results.map(r => {
  let pass = false;
  if (r.operation === 'sign_in' && r.actor === 'admin') pass = r.ok;
  if (r.operation === 'select' && r.actor === 'anon') pass = r.rowCount === 0;
  if (r.operation === 'select' && r.actor === 'admin') pass = r.table === 'students' ? Number(r.rowCount) > 0 : r.ok;
  if (r.operation === 'select' && r.actor === 'non_admin') pass = r.rowCount === 0;
  if (r.operation === 'insert' && r.actor === 'anon') pass = !r.ok;
  if (r.operation === 'insert' && r.actor === 'admin') pass = r.ok;
  if (r.operation === 'insert' && r.actor === 'non_admin') pass = !r.ok;
  return { ...r, pass };
});

console.table(judged.map(({ bodyPreview, ...r }) => r));
console.log(JSON.stringify(judged, null, 2));

const important = judged.filter(r =>
  (r.table === 'auth' && r.actor === 'admin') ||
  (r.table === 'students' && r.operation === 'select') ||
  (r.table === 'students' && r.operation === 'insert')
).map(r => ({
  actor: r.actor,
  table: r.table,
  operation: r.operation,
  status: r.status,
  rowCount: r.rowCount,
  pass: r.pass,
  bodyPreview: r.bodyPreview
}));

console.log('\n=== IMPORTANT SUMMARY ===');
for (const r of important) {
  const details = r.bodyPreview ? ` / detail=${r.bodyPreview}` : '';
  console.log(`${r.actor} / ${r.table} / ${r.operation} / status=${r.status} / rowCount=${r.rowCount} / pass=${r.pass}${details}`);
}
