#!/usr/bin/env node
/*
  ☆マスタCSV -> Supabase students 同期プレビュー/同期。

  Required:
    MASTER_CSV_PATH

  Optional for Supabase diff / actual sync:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

  Usage:
    DRY_RUN=1 MASTER_CSV_PATH=./master.csv node scripts/sync_students_from_master_csv.mjs
    DRY_RUN=1 MASTER_CSV_PATH=./master.csv SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync_students_from_master_csv.mjs
*/

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MASTER_CSV_PATH = process.env.MASTER_CSV_PATH;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY_RUN = process.env.DRY_RUN !== '0';
const OUT_DIR = process.env.SYNC_PREVIEW_DIR || 'sync-previews';

if (!MASTER_CSV_PATH) {
  console.error('MASTER_CSV_PATH is required.');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(v => v !== '')) rows.push(row);
  return rows;
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeHeader(value) {
  return clean(value).replace(/\s+/g, '').toLowerCase();
}

function findCol(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const c = normalizeHeader(candidate);
    const exact = normalized.findIndex(h => h === c);
    if (exact >= 0) return exact;
  }
  for (const candidate of candidates) {
    const c = normalizeHeader(candidate);
    const partial = normalized.findIndex(h => h.includes(c));
    if (partial >= 0) return partial;
  }
  return -1;
}

function normalizeGrade(value) {
  const s = clean(value)
    .replace(/[１２３４５６]/g, ch => ({ '１':'1','２':'2','３':'3','４':'4','５':'5','６':'6' }[ch]))
    .replace(/^小学/, '小')
    .replace(/^中学/, '中')
    .replace(/^高校/, '高')
    .replace(/年$/, '');
  const m = s.match(/^([小中高])?([1-6])$/);
  if (!m) return s;
  return (m[1] || '中') + m[2];
}

function normalizeCampus(value) {
  const s = clean(value);
  if (s === '神領' || s === '神領校') return '神領校';
  if (s === '大手' || s === '大手町' || s === '大手町校') return '大手町校';
  return s;
}

function parseDate(value) {
  const s = clean(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function csvEscape(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isActiveFlag(value) {
  const s = clean(value);
  return ['1', '在籍', '在籍中', '0', '保留', '保留中'].includes(s);
}

function buildColumnMap(headers) {
  return {
    student_code: findCol(headers, ['生徒コード', '生徒ID', 'ID', 'コード', '生徒番号', '番号']),
    name: findCol(headers, ['氏名', '名前', '生徒名']),
    name_kana: findCol(headers, ['フリガナ', 'ふりがな', '氏名カナ', 'カナ', 'name_kana']),
    campus: findCol(headers, ['校舎', 'キャンパス', 'campus']),
    grade: findCol(headers, ['学年', 'grade']),
    school_name: findCol(headers, ['学校名', '中学校', '在学校', '学校', 'school']),
    active: findCol(headers, ['在籍判定', '在籍フラグ', '在籍', '状態', 'ステータス']),
    enrollment_date: findCol(headers, ['入塾日', '入会日', '入塾年月日']),
    withdrawal_date: findCol(headers, ['退塾日', '退会日', '退塾年月日'])
  };
}

async function readSupabaseStudents() {
  if (!SUPABASE_URL || !SERVICE_KEY) return [];
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/students`);
  url.searchParams.set('select', 'id,student_code,name,name_kana,campus,grade,school_name,active,enrollment_date,withdrawal_date');
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase students read failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function upsertStudents(rows) {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/students`);
  url.searchParams.set('on_conflict', 'student_code');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(`Supabase students upsert failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function diffStudent(next, current) {
  if (!current) return ['new'];
  const fields = ['name', 'name_kana', 'campus', 'grade', 'school_name', 'active', 'enrollment_date', 'withdrawal_date'];
  return fields.filter(f => clean(next[f]) !== clean(current[f]));
}

const text = await readFile(MASTER_CSV_PATH, 'utf8');
const rows = parseCsv(text);
if (rows.length < 1) throw new Error('CSV has no rows.');

const headers = rows[0].map(clean);
const col = buildColumnMap(headers);
const missingColumns = Object.entries(col).filter(([key, idx]) => idx < 0 && ['student_code', 'name', 'campus', 'grade', 'active'].includes(key));
const existing = await readSupabaseStudents();
const existingByCode = new Map(existing.map(s => [String(s.student_code), s]));
const seenCodes = new Map();
const issues = [];
const preview = [];

const validGrades = new Set(['小1','小2','小3','小4','小5','小6','中1','中2','中3','高1','高2','高3']);
const validCampuses = new Set(['神領校', '大手町校']);

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const rowNo = i + 1;
  const student_code = col.student_code >= 0 ? clean(r[col.student_code]) : '';
  const name = col.name >= 0 ? clean(r[col.name]) : '';
  const name_kana = col.name_kana >= 0 ? clean(r[col.name_kana]) : '';
  const campus = col.campus >= 0 ? normalizeCampus(r[col.campus]) : '';
  const grade = col.grade >= 0 ? normalizeGrade(r[col.grade]) : '';
  const school_name = col.school_name >= 0 ? clean(r[col.school_name]) : '';
  const activeValue = col.active >= 0 ? clean(r[col.active]) : '';
  const active = isActiveFlag(activeValue);
  const enrollment_date = col.enrollment_date >= 0 ? parseDate(r[col.enrollment_date]) : null;
  const withdrawal_date = col.withdrawal_date >= 0 ? parseDate(r[col.withdrawal_date]) : null;

  if (!student_code && !name) continue;

  const rowIssues = [];
  if (!student_code) rowIssues.push('生徒コード空欄');
  if (!name) rowIssues.push('氏名空欄');
  if (student_code && seenCodes.has(student_code)) rowIssues.push(`重複生徒コード: ${student_code}（初出${seenCodes.get(student_code)}行目）`);
  if (student_code) seenCodes.set(student_code, rowNo);
  if (grade && !validGrades.has(grade)) rowIssues.push(`不正な学年: ${grade}`);
  if (campus && !validCampuses.has(campus)) rowIssues.push(`不正な校舎: ${campus}`);
  if (!student_code) rowIssues.push('紐付け不能');

  const next = { student_code, name, name_kana, campus, grade, school_name, active, enrollment_date, withdrawal_date, source_row: rowNo, source_updated_at: new Date().toISOString() };
  const current = existingByCode.get(student_code);
  const changed = diffStudent(next, current);
  let action = 'unchanged';
  if (rowIssues.length) action = 'error';
  else if (!current) action = 'insert';
  else if (changed.length) action = 'update';

  if (rowIssues.length) issues.push({ row: rowNo, student_code, name, issues: rowIssues });
  preview.push({ row: rowNo, action, changed: changed.join('|'), issues: rowIssues.join('|'), ...next });
}

const csvCodes = new Set(preview.filter(r => r.student_code).map(r => r.student_code));
for (const current of existing) {
  if (current.student_code && !csvCodes.has(String(current.student_code)) && current.active) {
    preview.push({
      row: '',
      action: 'disable',
      changed: 'active',
      issues: '',
      student_code: current.student_code,
      name: current.name,
      name_kana: current.name_kana || '',
      campus: current.campus || '',
      grade: current.grade || '',
      school_name: current.school_name || '',
      active: false,
      enrollment_date: current.enrollment_date || null,
      withdrawal_date: current.withdrawal_date || null,
      source_row: null,
      source_updated_at: new Date().toISOString()
    });
  }
}

const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
await mkdir(OUT_DIR, { recursive: true });

const summary = {
  dry_run: DRY_RUN,
  csv_total_rows: rows.length - 1,
  mapped_columns: Object.fromEntries(Object.entries(col).map(([key, idx]) => [key, { index: idx >= 0 ? idx + 1 : null, header: idx >= 0 ? headers[idx] : null }])),
  missing_required_columns: missingColumns.map(([key]) => key),
  active_students: preview.filter(r => r.active && r.action !== 'disable' && r.action !== 'error').length,
  with_student_code: preview.filter(r => r.student_code).length,
  without_student_code: preview.filter(r => !r.student_code).length,
  insert_planned: preview.filter(r => r.action === 'insert').length,
  update_planned: preview.filter(r => r.action === 'update').length,
  unchanged: preview.filter(r => r.action === 'unchanged').length,
  disable_planned: preview.filter(r => r.action === 'disable').length,
  duplicate_student_codes: issues.filter(i => i.issues.some(x => x.startsWith('重複生徒コード'))).length,
  invalid_grades: issues.filter(i => i.issues.some(x => x.startsWith('不正な学年'))).length,
  invalid_campuses: issues.filter(i => i.issues.some(x => x.startsWith('不正な校舎'))).length,
  blank_names: issues.filter(i => i.issues.includes('氏名空欄')).length,
  unmatchable: issues.filter(i => i.issues.includes('紐付け不能')).length,
  supabase_existing_students: existing.length
};

const previewCsv = [
  ['row','action','changed','issues','student_code','name','name_kana','campus','grade','school_name','active','enrollment_date','withdrawal_date','source_row'].join(','),
  ...preview.map(r => ['row','action','changed','issues','student_code','name','name_kana','campus','grade','school_name','active','enrollment_date','withdrawal_date','source_row'].map(k => csvEscape(r[k])).join(','))
].join('\n');

const csvPath = join(OUT_DIR, `sync-preview-${timestamp}.csv`);
const jsonPath = join(OUT_DIR, `sync-preview-${timestamp}.json`);
await writeFile(csvPath, previewCsv, 'utf8');
await writeFile(jsonPath, JSON.stringify({ summary, issues, preview }, null, 2), 'utf8');

if (!DRY_RUN) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DRY_RUN=0.');
  if (summary.missing_required_columns.length || issues.length) throw new Error('Validation failed. Review preview files before syncing.');
  const rowsToWrite = preview
    .filter(r => ['insert', 'update', 'disable'].includes(r.action))
    .map(r => ({
      student_code: r.student_code,
      name: r.name,
      name_kana: r.name_kana,
      campus: r.campus,
      grade: r.grade,
      school_name: r.school_name,
      active: r.active,
      enrollment_date: r.enrollment_date,
      withdrawal_date: r.withdrawal_date,
      source_row: r.source_row,
      source_updated_at: r.source_updated_at
    }));
  const result = await upsertStudents(rowsToWrite);
  summary.synced_students = result.length;
}

console.log(JSON.stringify({ ...summary, preview_csv: csvPath, preview_json: jsonPath }, null, 2));
