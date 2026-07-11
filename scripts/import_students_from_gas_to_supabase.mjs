#!/usr/bin/env node

const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DRY_RUN = process.env.DRY_RUN !== '0';

if (!GAS_WEB_APP_URL || !SUPABASE_URL || !ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('GAS_WEB_APP_URL, SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, and ADMIN_PASSWORD are required.');
  process.exit(1);
}

const sbBase = SUPABASE_URL.replace(/\/$/, '');

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function activeFromFlag(value) {
  const flag = clean(value);
  return !['退塾', '退会', 'inactive', 'false', '0'].includes(flag);
}

async function signIn() {
  const res = await fetch(`${sbBase}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
  if (!res.ok) {
    const message = typeof body === 'object' && body ? (body.msg || body.message || JSON.stringify(body)) : String(body || '');
    throw new Error(`Supabase sign in failed: ${res.status} ${message}`);
  }
  return body.access_token;
}

async function gas(action, data = {}) {
  const res = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...data })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GAS ${action} failed: ${res.status} ${text.slice(0, 200)}`);
  let json = null;
  try { json = JSON.parse(text); } catch (e) {
    throw new Error(`GAS ${action} did not return JSON: ${text.slice(0, 200)}`);
  }
  if (!json.success) throw new Error(`GAS ${action} failed: ${json.error || 'unknown error'}`);
  return json;
}

async function readSupabaseStudents(token) {
  const url = new URL(`${sbBase}/rest/v1/students`);
  url.searchParams.set('select', 'student_code,name,campus,grade,school_name,active');
  const res = await fetch(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase students read failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

async function upsertStudents(token, rows) {
  if (!rows.length) return [];
  const url = new URL(`${sbBase}/rest/v1/students`);
  url.searchParams.set('on_conflict', 'student_code');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(rows)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase students upsert failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

const token = await signIn();
const studentsRes = await gas('getStudents');
const gasStudents = Array.isArray(studentsRes.students) ? studentsRes.students : [];
const rows = gasStudents.map((s, index) => ({
  student_code: clean(s.id || s.studentId || s.student_code),
  name: clean(s.name),
  name_kana: clean(s.kana || s.nameKana || s.name_kana),
  campus: clean(s.campus),
  grade: clean(s.grade),
  school_name: clean(s.school || s.school_name),
  active: activeFromFlag(s.flag || s.status || s.active),
  source_row: index + 2,
  source_updated_at: clean(s.syncedAt || s.updatedAt) || new Date().toISOString()
})).filter(s => s.student_code && s.name);

const existing = await readSupabaseStudents(token);
const existingByCode = new Map(existing.map(s => [String(s.student_code), s]));
const planned = rows.map(row => {
  const current = existingByCode.get(row.student_code);
  if (!current) return { action: 'insert', ...row };
  const changed = ['name', 'name_kana', 'campus', 'grade', 'school_name', 'active']
    .filter(key => String(row[key] ?? '') !== String(current[key] ?? ''));
  return { action: changed.length ? 'update' : 'unchanged', changed: changed.join('|'), ...row };
});

console.log(JSON.stringify({
  dry_run: DRY_RUN,
  gas_students: gasStudents.length,
  importable_students: rows.length,
  existing_supabase_students: existing.length,
  insert_planned: planned.filter(r => r.action === 'insert').length,
  update_planned: planned.filter(r => r.action === 'update').length,
  unchanged: planned.filter(r => r.action === 'unchanged').length,
  skipped_from_gas: gasStudents.length - rows.length,
  sample: planned.slice(0, 5).map(({ action, student_code, name, campus, grade, school_name, active }) => ({
    action, student_code, name, campus, grade, school_name, active
  }))
}, null, 2));

if (DRY_RUN) {
  console.log('Dry run only. Run again with DRY_RUN=0 to import.');
  process.exit(0);
}

const writableRows = planned
  .filter(r => ['insert', 'update'].includes(r.action))
  .map(({ action, changed, ...row }) => row);
const result = await upsertStudents(token, writableRows);
console.log(`Imported students: ${result.length}`);

const after = await readSupabaseStudents(token);
console.log(`Supabase students after import: ${after.length}`);
