import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./assets/js/grade-order.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source, context);

const order = context.StepGradeOrder;
assert.ok(order, 'StepGradeOrder should be exposed');

const scores = order.scoresNewest([
  { year: '2025', term: '3' },
  { year: '2026', term: '1' },
  { year: '2025', term: '1' },
  { year: '2025', term: '2' }
]);
assert.deepEqual(
  Array.from(scores, row => `${row.year}-${row.term}`),
  ['2026-1', '2025-3', '2025-2', '2025-1']
);

const reports = order.reportsNewest([
  { year: '2025', semester: '前期' },
  { year: '2026', semester: '1学期' },
  { year: '2025', semester: '3学期' },
  { year: '2025', semester: '後期' }
]);
assert.deepEqual(
  Array.from(reports, row => `${row.year}-${row.semester}`),
  ['2026-1学期', '2025-3学期', '2025-後期', '2025-前期']
);

const admin = fs.readFileSync(new URL('./admin.html', import.meta.url), 'utf8');
const directory = fs.readFileSync(new URL('./student_directory.html', import.meta.url), 'utf8');
assert.match(admin, /displayScores = StepGradeOrder\.scoresNewest\(cmpScoreData\)/);
assert.match(admin, /displayReports = StepGradeOrder\.reportsNewest\(cmpRpData\)/);
assert.match(admin, /const sortedScores = StepGradeOrder\.scoresNewest\(scores\)/);
assert.match(directory, /StepGradeOrder\.scoresNewest\(rows\)/);
assert.match(directory, /StepGradeOrder\.reportsNewest\(rows\)/);

console.log('grade ordering tests passed');
