import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('./admin.html', import.meta.url), 'utf8');

test('login requires a large, nearby device selection', () => {
  assert.match(page, /id="devicePersonal"[\s\S]*自分・家族の端末/);
  assert.match(page, /id="deviceSchool"[\s\S]*塾のタブレット/);
  assert.match(page, /id="deviceWarning" class="deviceWarning hidden" role="alert"/);
  assert.match(page, /\.deviceWarning\{[^}]*font-size:1rem;[^}]*font-weight:800/);
  assert.match(page, /if \(!adminDeviceMode\) \{[\s\S]*deviceWarning[\s\S]*return;/);
});

test('personal device remembers credentials and login until explicit logout', () => {
  assert.match(page, /localStorage\.setItem\(ADMIN_DEVICE_KEY, 'personal'\)/);
  assert.match(page, /rememberAdminLogin\(code, pw/);
  assert.match(page, /localStorage\.getItem\('adminLoggedIn'\) === '1'/);
  assert.match(page, /if \(code && password\) await doAdminLogin\(\)/);
  assert.match(page, /localStorage\.removeItem\('adminPwInput'\)/);
});

test('school device never persists credentials and logs out after 30 minutes idle', () => {
  assert.match(page, /const ADMIN_IDLE_LIMIT_MS = 30 \* 60 \* 1000/);
  assert.match(page, /adminDeviceMode === 'personal'[\s\S]*rememberAdminLogin/);
  assert.match(page, /setTimeout\(\(\) => logout\(\{ automatic:true \}\), ADMIN_IDLE_LIMIT_MS\)/);
  assert.match(page, /30分間操作がなかったため、自動でログアウトしました/);
});
