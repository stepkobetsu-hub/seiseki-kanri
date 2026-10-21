import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('./admin.html', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('./supabase/functions/seiseki-admin-runtime-v1/index.ts', import.meta.url), 'utf8');

test('compare headings and both sidebar links use the shared history editor', () => {
  assert.match(page, /テスト成績 <button[^>]+openGradeHistoryEditor\('score'\)[^>]*>追加・編集/);
  assert.match(page, /通知表評定 <button[^>]+openGradeHistoryEditor\('report'\)[^>]*>追加・編集/);
  assert.match(page, /openGradeHistoryFromNav\('score',this\)/);
  assert.match(page, /openGradeHistoryFromNav\('report',this\)/);
  assert.match(page, /getStudentGradeProfile/);
});

test('editor supports historical keys, additions, totals, status and compare refresh', () => {
  assert.match(page, /data-original-year/);
  assert.match(page, /data-original-term/);
  assert.match(page, /data-original-semester/);
  assert.match(page, /addGradeHistoryRow\('score'\)/);
  assert.match(page, /addGradeHistoryRow\('report'\)/);
  assert.match(page, /insertAdjacentHTML\('afterbegin'/);
  assert.match(page, /firstElementChild\?\.scrollIntoView/);
  assert.match(page, /gradeHistoryTotal/);
  assert.match(page, /件を保存中/);
  assert.match(page, /await loadCompare\(gradeHistoryStudentId\)/);
  assert.match(page, /overflow:auto;flex:1/);
  assert.match(page, /gradeHistoryModal\[data-section="report"\]/);
  assert.match(page, /gradeHistoryModal\{box-sizing:border-box;width:min\(96vw,1100px\)/);
  assert.match(page, /input\.yearField\{width:60px/);
  assert.match(page, /input\.ratingField\{width:38px/);
  assert.match(page, /<span>5科<\/span><span>順位<\/span>/);
  assert.match(page, /data-section="score"/);
});

test('client and server reject duplicates, invalid ranges and empty rows', () => {
  assert.match(page, /テスト成績が重複しています/);
  assert.match(page, /通知表が重複しています/);
  assert.match(page, /点数は0〜100/);
  assert.match(page, /評定は1〜5/);
  assert.match(runtime, /DUPLICATE_SCORE/);
  assert.match(runtime, /DUPLICATE_REPORT/);
  assert.match(runtime, /EMPTY_SCORE/);
  assert.match(runtime, /EMPTY_REPORT/);
});

test('natural-key edits patch the original row and mirror delete before save', () => {
  assert.match(runtime, /method: 'PATCH'[\s\S]*originalYear/);
  assert.match(runtime, /action:'deleteScore'[\s\S]*originalTerm/);
  assert.match(runtime, /action:'deleteReport'[\s\S]*originalSemester/);
  assert.match(runtime, /steps\.push\(payload\)/);
});

test('database failures are logged with a trace and shown without raw details', () => {
  assert.match(runtime, /event:'database_request_failed'/);
  assert.match(runtime, /code: 'DATABASE_ERROR'/);
  assert.match(runtime, /参照ID: \$\{trace\}/);
  assert.match(page, /referenceId: result\.trace \|\| payload\.requestTrace/);
  assert.doesNotMatch(page, /closeGradeHistoryEditor\(true\)[\s\S]{0,300}catch \(error\)[\s\S]{0,100}closeGradeHistoryEditor/);
});

