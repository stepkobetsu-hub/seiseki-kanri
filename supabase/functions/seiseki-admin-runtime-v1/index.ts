import { CORS_HEADERS, preflightResponse } from './storage.ts';

type JsonObject = Record<string, unknown>;

const ADMIN_ACTIONS = new Set([
  'getStudents', 'getStudentList', 'getAllScores', 'getStudentScores',
  'saveScore', 'deleteScore', 'getAllReports', 'getReports', 'saveReport',
  'deleteReport', 'getAllWishes', 'getWish', 'saveWish', 'saveWishResult',
  'getSchools', 'addSchool', 'updateSchool', 'deleteSchool',
  'reconcileLegacy',
]);
const WRITE_ACTIONS = new Set(['saveScore', 'deleteScore', 'saveReport', 'deleteReport', 'saveWish', 'saveWishResult', 'addSchool', 'updateSchool', 'deleteSchool']);
const ADMIN_PERMISSION_LEVELS = new Set(['2', '3', '4']);
const GRADE_GAS_URL = 'https://script.google.com/macros/s/AKfycbypkUc0MqZ07E7pZRglNPeRM56WbCcuWaLpRzi9bVFcPklHDxaaLC7GfzG6ozTGCbEX/exec';
const STAFF_SESSION_API_URL = GRADE_GAS_URL;
const WISH_FIELDS = [
  'pub1name', 'pub1dept', 'pub2name', 'pub2dept', 'pub3name', 'pub3dept',
  'pri1name', 'pri1dept', 'pri2name', 'pri2dept', 'pri3name', 'pri3dept',
];

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function commonApiEndpoint(raw: string): string {
  const url = new URL(raw);
  if (!url.pathname || url.pathname === '/') url.pathname = '/api';
  return url.toString();
}

async function verifyAdmin(token: unknown): Promise<JsonObject> {
  if (typeof token !== 'string' || !token.trim()) throw new ResponseError(401, 'AUTH_REQUIRED', 'Authentication required');
  const tokenHash = await sha256Text(token);
  const cached = await pg(query('seiseki_admin_sessions', { select:'staff_code,permission_level,expires_at,verified_at', token_hash:`eq.${tokenHash}`, limit:1 })) as JsonObject[];
  if (cached.length) {
    const session = cached[0];
    const recentlyVerified = Date.now() - new Date(String(session.verified_at)).getTime() < 5 * 60 * 1000;
    const unexpired = new Date(String(session.expires_at)).getTime() > Date.now();
    if (recentlyVerified && unexpired && ADMIN_PERMISSION_LEVELS.has(String(session.permission_level))) return session;
  }
  const response = await fetch(commonApiEndpoint(STAFF_SESSION_API_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action: 'verifySystemPortal', systemPortalSessionToken: token }),
  });
  const result = await response.json().catch(() => ({})) as JsonObject;
  if (!response.ok || result.success !== true) throw new ResponseError(401, 'AUTH_REQUIRED', 'Authentication required');
  if (!ADMIN_PERMISSION_LEVELS.has(String(result.permissionLevel ?? ''))) {
    throw new ResponseError(403, 'ADMIN_FORBIDDEN', 'Administrator permission required');
  }
  await pg(query('seiseki_admin_sessions', { on_conflict:'token_hash' }), {
    method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
    body:JSON.stringify({ token_hash:tokenHash, staff_code:String(result.code ?? ''), permission_level:String(result.permissionLevel), expires_at:String(result.expiresAt || new Date(Date.now() + 8 * 3600e3).toISOString()), verified_at:new Date().toISOString() }),
  });
  return result;
}

class ResponseError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function json(body: JsonObject, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

function pgHeaders(prefer = ''): HeadersInit {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function pg(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: { ...pgHeaders(String((init.headers as Record<string, string> | undefined)?.Prefer ?? '')), ...(init.headers || {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Database request failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function gas(action: string, payload: JsonObject = {}): Promise<JsonObject> {
  const response = await fetch(GRADE_GAS_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({})) as JsonObject;
  if (!response.ok || result.success !== true) throw new Error(`Legacy ${action} failed: ${String(result.error ?? response.status)}`);
  return result;
}

function query(path: string, params: Record<string, unknown>): string {
  const url = new URL(`https://internal/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) url.searchParams.set(key, String(value));
  });
  return `${path}${url.search}`;
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? Math.min(number, max) : fallback;
}

function numberOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseObject(value: unknown): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  if (typeof value !== 'string' || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

function student(row: JsonObject): JsonObject {
  return {
    id: row.student_code, studentId: row.student_code, studentCode: row.student_code,
    name: row.name ?? '', nameKana: row.name_kana ?? '', campus: row.campus ?? '',
    grade: row.grade ?? '', school: row.school_name ?? '',
    flag: row.active === false ? '0' : '1', enrollmentFlag: row.active === false ? '0' : '1',
    active: row.active !== false, syncedAt: row.source_updated_at ?? row.updated_at ?? '',
  };
}

function score(row: JsonObject): JsonObject {
  return {
    id: row.id, studentId: row.student_code, name: row.student_name ?? '', campus: row.campus ?? '',
    grade: row.grade ?? '', school: row.school_name ?? '', year: row.school_year, term: row.test_number,
    jpn: row.japanese, soc: row.social, math: row.math, sci: row.science, eng: row.english,
    mus: row.music, art: row.art, pe: row.health_pe, tech: row.technology_home,
    total5: row.total_5, total9: row.total_9, rank5: row.rank_5, rank9: row.rank_9,
    avg_jpn: row.avg_japanese, avg_soc: row.avg_social, avg_math: row.avg_math,
    avg_sci: row.avg_science, avg_eng: row.avg_english, avg_total5: row.avg_total_5,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function report(row: JsonObject): JsonObject {
  return {
    id: row.id, studentId: row.student_code, name: row.student_name ?? '', campus: row.campus ?? '',
    grade: row.grade ?? '', school: row.school_name ?? '', year: row.school_year, semester: row.term,
    rp_jpn: row.japanese, rp_soc: row.social, rp_math: row.math, rp_sci: row.science, rp_eng: row.english,
    rp_mus: row.music, rp_art: row.art, rp_pe: row.health_pe, rp_tech: row.technology_home,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function wish(row: JsonObject): JsonObject {
  return {
    id: row.id, studentId: row.student_code, name: row.student_name ?? '', campus: row.campus ?? '',
    grade: row.grade ?? '', ...(parseObject(row.wishes)), results: parseObject(row.results),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function studentUuid(studentId: unknown): Promise<string> {
  const code = String(studentId ?? '').trim();
  if (!code) throw new ResponseError(400, 'INVALID_STUDENT', 'studentId is required');
  const rows = await pg(query('students', { select: 'id', student_code: `eq.${code}`, limit: 1 })) as JsonObject[];
  if (!rows.length) throw new ResponseError(404, 'STUDENT_NOT_FOUND', 'Student not found');
  return String(rows[0].id);
}

async function getStudents(payload: JsonObject): Promise<JsonObject> {
  const limit = positiveInt(payload.limit, 1000, 1000);
  const offset = positiveInt(payload.offset, 0, 100000);
  const params: Record<string, unknown> = {
    select: 'student_code,name,name_kana,campus,grade,school_name,active,source_updated_at,updated_at',
    order: 'active.desc,campus.asc,grade.asc,student_code.asc', limit, offset,
  };
  if (payload.campus) params.campus = `eq.${payload.campus}`;
  if (Array.isArray(payload.grades) && payload.grades.length) params.grade = `in.(${payload.grades.map(String).join(',')})`;
  else if (payload.grade) params.grade = `eq.${payload.grade}`;
  if (payload.school) params.school_name = `eq.${payload.school}`;
  if (payload.activeOnly === true) params.active = 'eq.true';
  if (payload.withdrawnOnly === true) params.active = 'eq.false';
  if (payload.q) {
    const safe = String(payload.q).replace(/[()*.,]/g, ' ').trim();
    if (safe) params.or = `(name.ilike.*${safe}*,student_code.ilike.*${safe}*)`;
  }
  const rows = await pg(query('students', params)) as JsonObject[];
  return { success: true, students: rows.map(student), hasMore: rows.length === limit, limit, offset, source: 'supabase' };
}

async function readScores(payload: JsonObject, all: boolean): Promise<JsonObject> {
  const params: Record<string, unknown> = { select: '*', order: 'school_year.desc,test_number.desc', limit: positiveInt(payload.limit, 1000, 2000), offset: positiveInt(payload.offset, 0, 100000) };
  if (!all || payload.studentId) params.student_code = `eq.${payload.studentId}`;
  if (payload.year) params.school_year = `eq.${payload.year}`;
  if (payload.year) params.school_year = `eq.${payload.year}`;
  if (payload.term) params.test_number = `eq.${payload.term}`;
  if (payload.campus) params.campus = `eq.${payload.campus}`;
  const rows = await pg(query('test_scores_with_students', params)) as JsonObject[];
  return { success: true, scores: rows.map(score), source: 'supabase' };
}

async function readReports(payload: JsonObject, all: boolean): Promise<JsonObject> {
  const params: Record<string, unknown> = { select: '*', order: 'school_year.desc,term.desc', limit: positiveInt(payload.limit, 1000, 2000), offset: positiveInt(payload.offset, 0, 100000) };
  if (!all || payload.studentId) params.student_code = `eq.${payload.studentId}`;
  if (payload.year) params.school_year = `eq.${payload.year}`;
  if (payload.semester) params.term = `eq.${payload.semester}`;
  if (payload.campus) params.campus = `eq.${payload.campus}`;
  const rows = await pg(query('report_cards_with_students', params)) as JsonObject[];
  return { success: true, data: rows.map(report), reports: rows.map(report), source: 'supabase' };
}

async function readWishes(payload: JsonObject, all: boolean): Promise<JsonObject> {
  const params: Record<string, unknown> = { select: '*', order: 'updated_at.desc', limit: positiveInt(payload.limit, 1000, 2000), offset: positiveInt(payload.offset, 0, 100000) };
  if (!all || payload.studentId) params.student_code = `eq.${payload.studentId}`;
  if (payload.campus) params.campus = `eq.${payload.campus}`;
  const rows = await pg(query('school_preferences_with_students', params)) as JsonObject[];
  const wishes = rows.map(wish);
  return all ? { success: true, wishes, source: 'supabase' } : { success: true, wish: wishes[0] ?? null, source: 'supabase' };
}

async function saveScore(payload: JsonObject): Promise<JsonObject> {
  const row = {
    student_id: await studentUuid(payload.studentId), school_year: Number(payload.year), test_number: Number(payload.term),
    japanese: numberOrNull(payload.jpn), social: numberOrNull(payload.soc), math: numberOrNull(payload.math), science: numberOrNull(payload.sci), english: numberOrNull(payload.eng),
    music: numberOrNull(payload.mus), art: numberOrNull(payload.art), health_pe: numberOrNull(payload.pe), technology_home: numberOrNull(payload.tech),
    total_5: numberOrNull(payload.total5), total_9: numberOrNull(payload.total9), rank_5: numberOrNull(payload.rank5), rank_9: numberOrNull(payload.rank9),
    avg_japanese: numberOrNull(payload.avg_jpn), avg_social: numberOrNull(payload.avg_soc), avg_math: numberOrNull(payload.avg_math),
    avg_science: numberOrNull(payload.avg_sci), avg_english: numberOrNull(payload.avg_eng), avg_total_5: numberOrNull(payload.avg_total5),
  };
  await pg(query('test_scores', { on_conflict: 'student_id,school_year,test_number' }), { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return mirror(payload);
}

async function saveReport(payload: JsonObject): Promise<JsonObject> {
  const ratings = ['rp_jpn','rp_soc','rp_math','rp_sci','rp_eng','rp_mus','rp_art','rp_pe','rp_tech'].map(key => numberOrNull(payload[key]));
  if (ratings.some(value => value !== null && (!Number.isInteger(value) || value < 1 || value > 5))) throw new ResponseError(400, 'INVALID_REPORT', 'Report ratings must be integers from 1 to 5');
  const row = {
    student_id: await studentUuid(payload.studentId), school_year: Number(payload.year), term: String(payload.semester),
    japanese: ratings[0], social: ratings[1], math: ratings[2], science: ratings[3], english: ratings[4],
    music: ratings[5], art: ratings[6], health_pe: ratings[7], technology_home: ratings[8],
  };
  await pg(query('report_cards', { on_conflict: 'student_id,school_year,term' }), { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return mirror(payload);
}

async function saveWish(payload: JsonObject): Promise<JsonObject> {
  const wishes = Object.fromEntries(WISH_FIELDS.map(key => [key, String(payload[key] ?? '')]));
  const row = { student_id: await studentUuid(payload.studentId), school_year: Number(payload.year ?? 0), wishes, results: parseObject(payload.results) };
  await pg(query('school_preferences', { on_conflict: 'student_id,school_year' }), { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return mirror(payload);
}

async function saveWishResult(payload: JsonObject): Promise<JsonObject> {
  const current = await readWishes(payload, false);
  const result = parseObject((current.wish as JsonObject | null)?.results);
  result[String(payload.key ?? '')] = payload.value;
  return saveWish({ ...((current.wish as JsonObject | null) ?? {}), ...payload, action: 'saveWish', results: JSON.stringify(result) });
}

async function remove(payload: JsonObject, table: string, thirdColumn: string, thirdValue: unknown): Promise<JsonObject> {
  const path = query(table, { student_id: `eq.${await studentUuid(payload.studentId)}`, school_year: `eq.${payload.year}`, [thirdColumn]: `eq.${thirdValue}` });
  await pg(path, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return mirror(payload);
}

async function getSchools(): Promise<JsonObject> {
  const rows = await pg(query('schools', { select: 'name,term_count,semester_type,schedule,schedule_url,memo,created_at', order: 'name.asc', limit: 2000 })) as JsonObject[];
  return { success: true, schools: rows.map(row => ({ name: row.name, termCount: row.term_count, semType: row.semester_type ?? '3term', testSchedule: row.schedule ?? {}, scheduleUrl: row.schedule_url ?? '', scheduleMemo: row.memo ?? '', createdAt: row.created_at })), source: 'supabase' };
}

async function saveSchool(payload: JsonObject): Promise<JsonObject> {
  const name = String(payload.name ?? '').trim();
  if (!name) throw new ResponseError(400, 'INVALID_SCHOOL', 'School name is required');
  const row = {
    name, term_count: numberOrNull(payload.termCount), semester_type: String(payload.semType ?? '3term'),
    schedule: parseObject(payload.testSchedule), schedule_url: String(payload.scheduleUrl ?? ''), memo: String(payload.scheduleMemo ?? ''),
  };
  await pg(query('schools', { on_conflict: 'name' }), { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return mirror(payload);
}

async function deleteSchool(payload: JsonObject): Promise<JsonObject> {
  const name = String(payload.name ?? '').trim();
  if (!name) throw new ResponseError(400, 'INVALID_SCHOOL', 'School name is required');
  await pg(query('schools', { name: `eq.${name}` }), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return mirror(payload);
}

async function sha256(rows: unknown[]): Promise<string> {
  const canonical = rows.map(row => JSON.stringify(row)).sort().join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function latestByNaturalKey(rows: JsonObject[], key: (row: JsonObject) => string): JsonObject[] {
  const latest = new Map<string, JsonObject>();
  for (const row of rows) {
    const naturalKey = key(row);
    const current = latest.get(naturalKey);
    if (!current || String(row.updatedAt ?? '') >= String(current.updatedAt ?? '')) latest.set(naturalKey, row);
  }
  return [...latest.values()];
}

async function reconcileLegacy(): Promise<JsonObject> {
  const [studentResult, scoreResult, reportResult, wishResult, schoolResult] = await Promise.all([
    gas('getStudentList'), gas('getAllScores'), gas('getAllReports'), gas('getAllWishes'), gas('getSchools'),
  ]);
  const legacyStudents = Array.isArray(studentResult.students) ? studentResult.students as JsonObject[] : [];
  const masterStudentRows = legacyStudents.map(item => ({
    student_code: String(item.id ?? item.studentId ?? '').trim(), name: String(item.name ?? '').trim(),
    name_kana: String(item.nameKana ?? item.kana ?? '').trim() || null, campus: String(item.campus ?? '').trim() || null,
    grade: String(item.grade ?? '').trim() || null, school_name: String(item.school ?? '').trim() || null,
    active: String(item.flag ?? '').trim() === '1',
    source_updated_at: item.syncedAt || new Date().toISOString(),
  })).filter(row => row.student_code && row.name);
  const masterCodes = new Set(masterStudentRows.map(row => row.student_code));
  const linkedRecords = [
    ...(Array.isArray(scoreResult.scores) ? scoreResult.scores as JsonObject[] : []),
    ...(Array.isArray(reportResult.data) ? reportResult.data as JsonObject[] : []),
    ...(Array.isArray(wishResult.wishes) ? wishResult.wishes as JsonObject[] : []),
  ];
  const orphanByCode = new Map<string, JsonObject>();
  for (const item of linkedRecords) {
    const code = String(item.studentId ?? '').trim();
    if (code && !masterCodes.has(code) && !orphanByCode.has(code)) orphanByCode.set(code, item);
  }
  const orphanStudentRows = [...orphanByCode].map(([code, item]) => ({
    student_code:code, name:String(item.name ?? '').trim() || code, name_kana:null,
    campus:String(item.campus ?? '').trim() || null, grade:String(item.grade ?? '').trim() || null,
    school_name:String(item.school ?? '').trim() || null, active:false, source_updated_at:new Date().toISOString(),
  }));
  const studentRows = [...masterStudentRows, ...orphanStudentRows];
  if (studentRows.length) await pg(query('students', { on_conflict: 'student_code' }), { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(studentRows) });

  const savedStudents = await pg(query('students', { select: 'id,student_code', limit: 5000 })) as JsonObject[];
  const idByCode = new Map(savedStudents.map(item => [String(item.student_code), String(item.id)]));
  const scoreSource = latestByNaturalKey(Array.isArray(scoreResult.scores) ? scoreResult.scores as JsonObject[] : [], item => `${item.studentId}|${item.year}|${item.term}`);
  const scoreRows = scoreSource.map(item => ({
    student_id: idByCode.get(String(item.studentId)), school_year: Number(item.year), test_number: Number(item.term),
    japanese:numberOrNull(item.jpn), social:numberOrNull(item.soc), math:numberOrNull(item.math), science:numberOrNull(item.sci), english:numberOrNull(item.eng),
    music:numberOrNull(item.mus), art:numberOrNull(item.art), health_pe:numberOrNull(item.pe), technology_home:numberOrNull(item.tech),
    total_5:numberOrNull(item.total5), total_9:numberOrNull(item.total9), rank_5:numberOrNull(item.rank5), rank_9:numberOrNull(item.rank9),
    avg_japanese:numberOrNull(item.avg_jpn), avg_social:numberOrNull(item.avg_soc), avg_math:numberOrNull(item.avg_math), avg_science:numberOrNull(item.avg_sci), avg_english:numberOrNull(item.avg_eng), avg_total_5:numberOrNull(item.avg_total5),
  })).filter(row => row.student_id && Number.isInteger(row.school_year) && Number.isInteger(row.test_number));
  const reportSource = latestByNaturalKey(Array.isArray(reportResult.data) ? reportResult.data as JsonObject[] : [], item => `${item.studentId}|${item.year}|${item.semester}`);
  const reportRows = reportSource.map(item => ({
    student_id:idByCode.get(String(item.studentId)), school_year:Number(item.year), term:String(item.semester ?? ''),
    japanese:numberOrNull(item.rp_jpn), social:numberOrNull(item.rp_soc), math:numberOrNull(item.rp_math), science:numberOrNull(item.rp_sci), english:numberOrNull(item.rp_eng),
    music:numberOrNull(item.rp_mus), art:numberOrNull(item.rp_art), health_pe:numberOrNull(item.rp_pe), technology_home:numberOrNull(item.rp_tech),
  })).filter(row => row.student_id && Number.isInteger(row.school_year) && row.term);
  const wishSource = latestByNaturalKey(Array.isArray(wishResult.wishes) ? wishResult.wishes as JsonObject[] : [], item => `${item.studentId}|${item.year ?? 0}`);
  const wishRows = wishSource.map(item => ({
    student_id:idByCode.get(String(item.studentId)), school_year:Number(item.year ?? 0),
    wishes:Object.fromEntries(WISH_FIELDS.map(key => [key, String(item[key] ?? '')])), results:parseObject(item.results),
  })).filter(row => row.student_id);
  const schoolRows = (Array.isArray(schoolResult.schools) ? schoolResult.schools as JsonObject[] : []).map(item => ({
    name:String(item.name ?? '').trim(), term_count:numberOrNull(item.termCount), semester_type:String(item.semType ?? '3term'),
    schedule:parseObject(item.testSchedule), schedule_url:String(item.scheduleUrl ?? ''), memo:String(item.scheduleMemo ?? ''),
  })).filter(row => row.name);
  if (scoreRows.length) await pg(query('test_scores', { on_conflict:'student_id,school_year,test_number' }), { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body:JSON.stringify(scoreRows) });
  if (reportRows.length) await pg(query('report_cards', { on_conflict:'student_id,school_year,term' }), { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body:JSON.stringify(reportRows) });
  if (wishRows.length) await pg(query('school_preferences', { on_conflict:'student_id,school_year' }), { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body:JSON.stringify(wishRows) });
  if (schoolRows.length) await pg(query('schools', { on_conflict:'name' }), { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body:JSON.stringify(schoolRows) });
  const counts = { students:studentRows.length, test_scores:scoreRows.length, report_cards:reportRows.length, school_preferences:wishRows.length, schools:schoolRows.length };
  const hashes = { students:await sha256(studentRows), test_scores:await sha256(scoreRows), report_cards:await sha256(reportRows), school_preferences:await sha256(wishRows), schools:await sha256(schoolRows) };
  return { success:true, source:'supabase', counts, hashes };
}

async function deliverMirror(row: JsonObject): Promise<void> {
  const mutationId = String(row.mutation_id);
  const payload = parseObject(row.payload);
  try {
    const olderParams: Record<string, unknown> = {
      select:'mutation_id', status:'in.(pending,failed)', created_at:`lt.${row.created_at}`, order:'created_at.asc', limit:1,
    };
    if (payload.studentId) olderParams['payload->>studentId'] = `eq.${payload.studentId}`;
    const older = await pg(query('seiseki_admin_mirror_queue', olderParams)) as JsonObject[];
    if (older.length) return;
    const response = await fetch(GRADE_GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success !== true) throw new Error(result?.error || `mirror HTTP ${response.status}`);
    await pg(query('seiseki_admin_mirror_queue', { mutation_id: `eq.${mutationId}` }), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'mirrored', attempts: Number(row.attempts ?? 0) + 1, last_error: null, updated_at: new Date().toISOString() }),
    });
  } catch (error) {
    const attempts = Number(row.attempts ?? 0) + 1;
    const delaySeconds = Math.min(3600, 30 * (2 ** Math.min(attempts - 1, 7)));
    await pg(query('seiseki_admin_mirror_queue', { mutation_id: `eq.${mutationId}` }), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', attempts, last_error: String(error).slice(0, 1000), next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(), updated_at: new Date().toISOString() }),
    });
    console.error('Google Sheet mirror failed', { mutationId, action: payload.action, attempts, error: String(error) });
  }
}

async function retryFailedMirrors(): Promise<void> {
  const rows = await pg(query('seiseki_admin_mirror_queue', { select: '*', status: 'in.(pending,failed)', next_attempt_at: `lte.${new Date().toISOString()}`, order: 'next_attempt_at.asc', limit: 5 })) as JsonObject[];
  for (const row of rows) await deliverMirror(row);
}

async function mirror(payload: JsonObject): Promise<JsonObject> {
  const mirrorPayload = { ...payload };
  delete mirrorPayload.token;
  const now = new Date().toISOString();
  const row = { mutation_id: String(payload.mutationId), action: String(payload.action), payload: mirrorPayload, status: 'pending', attempts: 0, next_attempt_at: now, created_at: now, updated_at: now };
  await pg(query('seiseki_admin_mirror_queue', { on_conflict: 'mutation_id' }), {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row),
  });
  EdgeRuntime.waitUntil(deliverMirror(row));
  return { success: true, source: 'supabase', mirrorStatus: 'queued' };
}

async function dispatch(payload: JsonObject): Promise<JsonObject> {
  switch (payload.action) {
    case 'getStudents': case 'getStudentList': return getStudents(payload);
    case 'getAllScores': return readScores(payload, true);
    case 'getStudentScores': return readScores(payload, false);
    case 'getAllReports': return readReports(payload, true);
    case 'getReports': return readReports(payload, false);
    case 'getAllWishes': return readWishes(payload, true);
    case 'getWish': return readWishes(payload, false);
    case 'getSchools': return getSchools();
    case 'addSchool': case 'updateSchool': return saveSchool(payload);
    case 'deleteSchool': return deleteSchool(payload);
    case 'reconcileLegacy': return reconcileLegacy();
    case 'saveScore': return saveScore(payload);
    case 'saveReport': return saveReport(payload);
    case 'saveWish': return saveWish(payload);
    case 'saveWishResult': return saveWishResult(payload);
    case 'deleteScore': return remove(payload, 'test_scores', 'test_number', payload.term);
    case 'deleteReport': return remove(payload, 'report_cards', 'term', payload.semester);
    default: throw new ResponseError(400, 'UNSUPPORTED_ACTION', 'Unsupported action');
  }
}

Deno.serve(async request => {
  const preflight = preflightResponse(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const payload = await request.json() as JsonObject;
    const action = String(payload.action ?? '');
    if (!ADMIN_ACTIONS.has(action)) throw new ResponseError(400, 'UNSUPPORTED_ACTION', 'Unsupported action');
    await verifyAdmin(payload.token);
    EdgeRuntime.waitUntil(retryFailedMirrors().catch(error => console.error('Mirror retry failed', error)));
    if (WRITE_ACTIONS.has(action) && !String(payload.mutationId ?? '').trim()) throw new ResponseError(400, 'MUTATION_ID_REQUIRED', 'mutationId is required');
    return json(await dispatch(payload));
  } catch (error) {
    if (error instanceof ResponseError) return json({ success: false, code: error.code, error: error.message }, error.status);
    console.error(error);
    return json({ success: false, code: 'INTERNAL_ERROR', error: 'Internal server error' }, 500);
  }
});
