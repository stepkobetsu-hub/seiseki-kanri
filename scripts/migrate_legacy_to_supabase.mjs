#!/usr/bin/env node
/*
  Existing GAS -> Supabase migration.

  Required env:
    GAS_WEB_APP_URL
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

  Dry run:
    DRY_RUN=1 node scripts/migrate_legacy_to_supabase.mjs
*/

const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!GAS_WEB_APP_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('GAS_WEB_APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const sbBase = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

async function gas(action, data = {}) {
  const res = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...data })
  });
  if (!res.ok) throw new Error(`GAS ${action} failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(`GAS ${action} failed: ${json.error || 'unknown error'}`);
  return json;
}

async function sbUpsert(table, rows, onConflict) {
  if (!rows.length) return [];
  if (DRY_RUN) return rows;
  const url = new URL(`${sbBase}/${table}`);
  if (onConflict) url.searchParams.set('on_conflict', onConflict);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function sbSelect(table, query = {}) {
  const url = new URL(`${sbBase}/${table}`);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Supabase select ${table} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function clean(value) {
  return value === undefined || value === null ? null : String(value).trim();
}

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scoreRow(s, studentId) {
  return {
    student_id: studentId,
    school_year: num(s.year),
    test_number: num(s.term),
    japanese: num(s.jpn),
    social: num(s.soc),
    math: num(s.math),
    science: num(s.sci),
    english: num(s.eng),
    music: num(s.mus),
    art: num(s.art),
    health_pe: num(s.pe),
    technology_home: num(s.tech),
    total_5: num(s.total5),
    total_9: num(s.total9),
    rank_5: num(s.rank5),
    rank_9: num(s.rank9),
    avg_japanese: num(s.avg_jpn),
    avg_social: num(s.avg_soc),
    avg_math: num(s.avg_math),
    avg_science: num(s.avg_sci),
    avg_english: num(s.avg_eng),
    avg_total_5: num(s.avg_total5),
    created_at: s.createdAt || undefined,
    updated_at: s.updatedAt || undefined
  };
}

function reportRow(r, studentId) {
  return {
    student_id: studentId,
    school_year: num(r.year),
    term: clean(r.semester),
    japanese: num(r.rp_jpn),
    social: num(r.rp_soc),
    math: num(r.rp_math),
    science: num(r.rp_sci),
    english: num(r.rp_eng),
    music: num(r.rp_mus),
    art: num(r.rp_art),
    health_pe: num(r.rp_pe),
    technology_home: num(r.rp_tech),
    created_at: r.createdAt || undefined,
    updated_at: r.updatedAt || undefined
  };
}

function wishRow(w, studentId) {
  const wishes = {
    pub1name: clean(w.pub1name), pub1dept: clean(w.pub1dept),
    pub2name: clean(w.pub2name), pub2dept: clean(w.pub2dept),
    pub3name: clean(w.pub3name), pub3dept: clean(w.pub3dept),
    pri1name: clean(w.pri1name), pri1dept: clean(w.pri1dept),
    pri2name: clean(w.pri2name), pri2dept: clean(w.pri2dept),
    pri3name: clean(w.pri3name), pri3dept: clean(w.pri3dept)
  };
  return {
    student_id: studentId,
    school_year: num(w.year) || 0,
    wishes,
    results: w.results || {},
    updated_at: w.updatedAt || undefined
  };
}

function memoRow(m, studentId) {
  return {
    id: /^[0-9a-f-]{36}$/i.test(String(m.id || '')) ? m.id : undefined,
    student_id: studentId || null,
    memo_date: clean(m.date),
    campus: clean(m.campus),
    contact_person: clean(m.counterpart),
    staff_name: clean(m.staff),
    staff_email: clean(m.staffEmail),
    content: clean(m.content) || '',
    is_deleted: false,
    created_at: m.createdAt || undefined,
    updated_at: m.updatedAt || undefined
  };
}

function required(row, keys) {
  return keys.every(k => row[k] !== null && row[k] !== undefined && row[k] !== '');
}

async function main() {
  console.log(`Migration started${DRY_RUN ? ' (dry run)' : ''}`);
  const [studentsRes, scoresRes, reportsRes, wishesRes, memosRes] = await Promise.all([
    gas('getStudents'),
    gas('getAllScores'),
    gas('getAllReports'),
    gas('getAllWishes'),
    gas('getMeetingMemos')
  ]);

  const studentRows = (studentsRes.students || []).map((s, idx) => ({
    student_code: clean(s.id),
    name: clean(s.name),
    campus: clean(s.campus),
    grade: clean(s.grade),
    school_name: clean(s.school),
    active: clean(s.flag) !== '退塾',
    source_row: idx + 2,
    source_updated_at: s.syncedAt || undefined
  })).filter(r => required(r, ['student_code', 'name']));

  await sbUpsert('students', studentRows, 'student_code');
  const savedStudents = await sbSelect('students', { select: 'id,student_code' });
  const studentIdByCode = new Map(savedStudents.map(s => [String(s.student_code), s.id]));

  const scoreRows = (scoresRes.scores || [])
    .map(s => scoreRow(s, studentIdByCode.get(String(s.studentId))))
    .filter(r => required(r, ['student_id', 'school_year', 'test_number']));
  const reportRows = (reportsRes.data || [])
    .map(r => reportRow(r, studentIdByCode.get(String(r.studentId))))
    .filter(r => required(r, ['student_id', 'school_year', 'term']));
  const wishRows = (wishesRes.wishes || [])
    .map(w => wishRow(w, studentIdByCode.get(String(w.studentId))))
    .filter(r => required(r, ['student_id']));
  const memoRows = (memosRes.memos || [])
    .map(m => memoRow(m, studentIdByCode.get(String(m.studentId))))
    .filter(r => r.content || r.memo_date);

  await sbUpsert('test_scores', scoreRows, 'student_id,school_year,test_number');
  await sbUpsert('report_cards', reportRows, 'student_id,school_year,term');
  await sbUpsert('school_preferences', wishRows, 'student_id,school_year');
  await sbUpsert('meeting_memos', memoRows, 'id');

  console.log(JSON.stringify({
    students: studentRows.length,
    test_scores: scoreRows.length,
    report_cards: reportRows.length,
    school_preferences: wishRows.length,
    meeting_memos: memoRows.length
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
