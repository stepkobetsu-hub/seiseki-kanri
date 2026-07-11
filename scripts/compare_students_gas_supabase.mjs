#!/usr/bin/env node
/*
  GAS getStudents と Supabase students の比較。

  Required:
    GAS_WEB_APP_URL
    SUPABASE_URL
    SUPABASE_ANON_KEY
    ADMIN_EMAIL
    ADMIN_PASSWORD
*/

const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!GAS_WEB_APP_URL || !SUPABASE_URL || !ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('GAS_WEB_APP_URL, SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD are required.');
  process.exit(1);
}

const base = SUPABASE_URL.replace(/\/$/, '');

async function timed(label, fn) {
  const started = performance.now();
  const data = await fn();
  const body = JSON.stringify(data);
  return { label, ms: Math.round(performance.now() - started), bytes: Buffer.byteLength(body), data };
}

async function gasStudents() {
  const res = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'getStudents' })
  });
  return await res.json();
}

async function signIn() {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error('Supabase login failed');
  return json.access_token;
}

async function supabaseStudents(token, params) {
  const url = new URL(`${base}/rest/v1/students`);
  url.searchParams.set('select', 'id,student_code,name,name_kana,campus,grade,school_name,active');
  url.searchParams.set('order', 'active.desc,campus.asc,grade.asc,student_code.asc');
  url.searchParams.set('limit', '50');
  url.searchParams.set('offset', String(params.offset || 0));
  url.searchParams.set('active', 'eq.true');
  if (params.campus) url.searchParams.set('campus', `eq.${params.campus}`);
  if (params.grade) url.searchParams.set('grade', `in.(${params.grade.join(',')})`);
  if (params.q) url.searchParams.set('or', `(name.ilike.*${params.q}*,student_code.ilike.*${params.q}*)`);
  const res = await fetch(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function normalizeGasStudent(s) {
  return {
    code: String(s.id || ''),
    name: s.name || '',
    campus: s.campus || '',
    grade: s.grade || '',
    school: s.school || ''
  };
}

function normalizeSbStudent(s) {
  return {
    code: String(s.student_code || ''),
    name: s.name || '',
    campus: s.campus || '',
    grade: s.grade || '',
    school: s.school_name || ''
  };
}

function filterGas(list, condition) {
  let rows = list;
  if (condition.campus) rows = rows.filter(s => s.campus === condition.campus || s.campus === condition.campus.replace(/校$/, ''));
  if (condition.grade) rows = rows.filter(s => condition.grade.includes(s.grade));
  if (condition.q) rows = rows.filter(s => s.name.includes(condition.q) || s.code.includes(condition.q));
  return rows.slice(condition.offset || 0, (condition.offset || 0) + 50);
}

const conditions = [
  { name: '初回生徒一覧', params: {} },
  { name: '神領校のみ', params: { campus: '神領校' } },
  { name: '大手町校のみ', params: { campus: '大手町校' } },
  { name: '中学生のみ', params: { grade: ['中1','中2','中3'] } },
  { name: '氏名検索', params: { q: process.env.SEARCH_NAME || 'テスト' } },
  { name: '生徒コード検索', params: { q: process.env.SEARCH_CODE || 'TEST' } },
  { name: '次の50件', params: { offset: 50 } }
];

const gasAll = await timed('GAS getStudents', gasStudents);
const gasList = (gasAll.data.students || []).map(normalizeGasStudent);
const token = await signIn();
const rows = [];

for (const condition of conditions) {
  const gasSliceStarted = performance.now();
  const gasSlice = filterGas(gasList, condition.params);
  const gasMs = condition.name === '初回生徒一覧' ? gasAll.ms : Math.round(performance.now() - gasSliceStarted);
  const sb = await timed(`Supabase ${condition.name}`, () => supabaseStudents(token, condition.params));
  const sbList = sb.data.map(normalizeSbStudent);
  const gasCodes = gasSlice.map(s => s.code).sort();
  const sbCodes = sbList.map(s => s.code).sort();
  const matched = JSON.stringify(gasCodes) === JSON.stringify(sbCodes);
  rows.push({
    condition: condition.name,
    gas_ms: gasMs,
    supabase_ms: sb.ms,
    gas_bytes: condition.name === '初回生徒一覧' ? gasAll.bytes : Buffer.byteLength(JSON.stringify(gasSlice)),
    supabase_bytes: sb.bytes,
    gas_count: gasSlice.length,
    supabase_count: sbList.length,
    content_matched: matched,
    missing_in_supabase: gasCodes.filter(c => !sbCodes.includes(c)).join('|'),
    extra_in_supabase: sbCodes.filter(c => !gasCodes.includes(c)).join('|')
  });
}

console.table(rows);
console.log(JSON.stringify(rows, null, 2));
