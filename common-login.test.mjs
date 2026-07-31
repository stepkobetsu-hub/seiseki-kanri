import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('./juku_app.html', import.meta.url), 'utf8');

test('student mode authenticates through the common session API', () => {
  assert.match(page, /action: 'studentLogin', studentId: id, password: pw/);
  assert.match(page, /action: 'getCommonStudentSession', token: session\.token/);
  assert.doesNotMatch(page, /localStorage\.setItem\('studentId'/);
  assert.doesNotMatch(page, /sessionStorage\.setItem\('studentMe'/);
});

test('student grade operations are sent through the bound gateway', () => {
  assert.match(page, /action: 'commonGradeRequest', token: session\.token, gradeAction: params\.action, payload: params/);
  assert.match(page, /studentCommonMode && STUDENT_GRADE_ACTIONS\.has/);
  assert.match(page, /studentCommonMode = false;\n\s*setHeader\('管理者'\)/);
});

test('logout revokes the server session and clears local state', () => {
  assert.match(page, /clearCommonSession\(\)/);
  assert.match(page, /action: 'logout', token: session\.token/);
});
