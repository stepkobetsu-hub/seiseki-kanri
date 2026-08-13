import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routeCode=fs.readFileSync(new URL('./gas_code.js',import.meta.url),'utf8');
const configCode=fs.readFileSync(new URL('./apps-script/zz_workspace_config.gs',import.meta.url),'utf8');
const code=routeCode+'\n'+configCode;

test('業務ホーム共有APIは共通認証とGoogle Sheet保存を使用する',()=>{
  assert.match(code,/case 'getWorkspaceConfig'/);
  assert.match(code,/case 'saveWorkspaceConfig'/);
  assert.match(code,/function getWorkspaceConfig\(data\)[\s\S]*requireSystemPortalAdmin_\(data\)/);
  assert.match(code,/function saveWorkspaceConfig\(data\)[\s\S]*requireSystemPortalAdmin_\(data\)/);
  assert.match(code,/WORKSPACE_CONFIG_SHEET_NAME = 'STEP業務ホーム設定'/);
  assert.match(code,/LockService\.getScriptLock\(\)/);
});

test('共有対象は配置設定とお気に入りだけに限定する',()=>{
  assert.match(code,/workspaceConfig: workspaceConfig/);
  assert.match(code,/favorites: Array\.from\(new Set\(favorites\)\)/);
  assert.doesNotMatch(code,/sharedState[^\n]*(password|systemPortalSessionToken)/i);
  assert.match(code,/WORKSPACE_CONFIG_MAX_LENGTH = 45000/);
});
