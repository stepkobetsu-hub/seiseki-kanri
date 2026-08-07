import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('./juku_app.html', import.meta.url), 'utf8');

test('student login has a large device choice and nearby warning', () => {
  assert.match(page, /id="studentDevicePersonal"[\s\S]*自分・家族の端末/);
  assert.match(page, /id="studentDeviceSchool"[\s\S]*塾のタブレット/);
  assert.match(page, /id="studentDeviceWarning" class="deviceWarning hidden" role="alert"/);
  assert.match(page, /\.deviceWarning\{[^}]*font-size:1rem;[^}]*font-weight:800/);
  assert.match(page, /id="loginId"[^>]*placeholder="例: 0001"/);
  assert.doesNotMatch(page, /例: S001/);
});

test('personal student device remembers credentials and has no idle timer', () => {
  assert.match(page, /localStorage\.setItem\(STUDENT_ID_KEY, id\)/);
  assert.match(page, /localStorage\.setItem\(STUDENT_PASSWORD_KEY, pw\)/);
  assert.match(page, /if \(studentDeviceMode !== 'school' \|\| !me\) return;/);
  assert.match(page, /if \(await resumeStudentSession\(\)\) return;/);
});

test('school student device uses session storage and logs out at 30 minutes', () => {
  assert.match(page, /const STUDENT_IDLE_LIMIT_MS = 30 \* 60 \* 1000/);
  assert.match(page, /const store = studentDeviceMode === 'school' \? sessionStorage : localStorage/);
  assert.match(page, /localStorage\.removeItem\(STUDENT_PASSWORD_KEY\)/);
  assert.match(page, /setTimeout\(\(\) => logout\(\{ automatic:true \}\), STUDENT_IDLE_LIMIT_MS\)/);
  assert.match(page, /30分間操作がなかったため、自動でログアウトしました/);
});

test('student logout removes the selected mode and saved credentials', () => {
  assert.match(page, /localStorage\.removeItem\(STUDENT_DEVICE_KEY\)/);
  assert.match(page, /localStorage\.removeItem\(STUDENT_ID_KEY\)/);
  assert.match(page, /localStorage\.removeItem\(STUDENT_PASSWORD_KEY\)/);
});
