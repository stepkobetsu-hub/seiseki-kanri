import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  enrollmentStatusFromMasterFlag,
  studentIndexRowFromDirectoryDetail,
  summarizeStudentIndexSync,
} from './supabase/functions/seiseki-admin-runtime-v1/student-enrollment-sync.mjs';

test('master flag preserves all three enrollment states', () => {
  assert.equal(enrollmentStatusFromMasterFlag(1), 'active');
  assert.equal(enrollmentStatusFromMasterFlag('1'), 'active');
  assert.equal(enrollmentStatusFromMasterFlag(0), 'withdrawal_scheduled');
  assert.equal(enrollmentStatusFromMasterFlag('0'), 'withdrawal_scheduled');
  assert.equal(enrollmentStatusFromMasterFlag(''), 'withdrawn');
  assert.equal(enrollmentStatusFromMasterFlag(null), 'withdrawn');
  assert.throws(() => enrollmentStatusFromMasterFlag('退塾'));
});

test('0 to blank is detected without deleting the student row', () => {
  const base = { success: true, editable: {}, student: { id: '9999', name: 'Test', flag: '0' } };
  const current = studentIndexRowFromDirectoryDetail(base, '2026-11-11T00:00:00Z');
  const next = studentIndexRowFromDirectoryDetail({ ...base, student: { ...base.student, flag: '' } }, '2026-11-11T00:05:00Z');
  const summary = summarizeStudentIndexSync([next], [current]);
  assert.equal(current.enrollment_status, 'withdrawal_scheduled');
  assert.equal(next.enrollment_status, 'withdrawn');
  assert.equal(next.active, false);
  assert.deepEqual(summary, { added: 0, updated: 1, changed: 1, total: 1 });
});

test('source timestamp alone does not create a false enrollment change', () => {
  const item = { success: true, editable: {}, student: { id: '9999', name: 'Test', flag: 0 } };
  const current = studentIndexRowFromDirectoryDetail(item, '2026-11-11T00:00:00Z');
  const next = studentIndexRowFromDirectoryDetail(item, '2026-11-11T00:05:00Z');
  assert.equal(summarizeStudentIndexSync([next], [current]).changed, 0);
});

test('admin and GAS use the authenticated five-minute Supabase sync path', () => {
  const html = readFileSync(new URL('./admin.html', import.meta.url), 'utf8');
  const gas = readFileSync(new URL('./gas_code.js', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('./supabase/functions/seiseki-admin-runtime-v1/index.ts', import.meta.url), 'utf8');
  const runSync = html.slice(html.indexOf('async function runSync()'), html.indexOf('function openStudentSyncPreview'));
  assert.match(runSync, /action: 'syncStudentDirectory', force: true/);
  assert.doesNotMatch(runSync, /syncStudents|applySyncResult|deleteDeactivated/);
  assert.match(html, /1=在籍 \/ 0=退塾予定 \/ 空欄=退塾確定/);
  assert.match(gas, /everyMinutes\(5\)/);
  assert.match(gas, /reportStudentDirectorySyncFailure/);
  assert.match(runtime, /case 'getStudentSyncStatus': return getStudentSyncStatus\(\)/);
  assert.doesNotMatch(runSync, /method: 'DELETE'/);
});
