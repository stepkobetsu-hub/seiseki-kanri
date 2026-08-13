const WORKSPACE_CONFIG_SHEET_NAME = 'STEP業務ホーム設定';
const WORKSPACE_CONFIG_KEY = 'shared';
const WORKSPACE_CONFIG_MAX_LENGTH = 45000;

function normalizeWorkspaceSharedState_(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const workspaceConfig = value.workspaceConfig;
  if (!workspaceConfig || typeof workspaceConfig !== 'object' || Array.isArray(workspaceConfig)) return null;
  const favorites = Array.isArray(value.favorites)
    ? value.favorites.map(function(id) { return String(id || '').trim(); }).filter(Boolean).slice(0, 100)
    : [];
  return {
    schemaVersion: 1,
    workspaceConfig: workspaceConfig,
    favorites: Array.from(new Set(favorites))
  };
}

function getWorkspaceConfigRow_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const keys = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let index = 0; index < keys.length; index++) {
    if (String(keys[index][0] || '').trim() === WORKSPACE_CONFIG_KEY) return index + 2;
  }
  return 0;
}

function readWorkspaceConfig_(sheet) {
  const row = getWorkspaceConfigRow_(sheet);
  if (!row) return { sharedState: null, version: 0, updatedAt: '', updatedBy: '' };
  const values = sheet.getRange(row, 1, 1, 6).getDisplayValues()[0];
  let parsed = null;
  try { parsed = JSON.parse(String(values[1] || '')); } catch (e) { parsed = null; }
  return {
    sharedState: normalizeWorkspaceSharedState_(parsed),
    version: Math.max(0, Number(values[5] || 0)),
    updatedAt: String(values[2] || ''),
    updatedBy: String(values[4] || '')
  };
}

function getWorkspaceConfig(data) {
  const verified = requireSystemPortalAdmin_(data);
  const sheet = getOrCreateSheet(WORKSPACE_CONFIG_SHEET_NAME, ['キー','設定JSON','更新日時','更新者コード','更新者名','版']);
  const current = readWorkspaceConfig_(sheet);
  return Object.assign({ success: true, expiresAt: verified.expiresAt }, current);
}

function saveWorkspaceConfig(data) {
  const verified = requireSystemPortalAdmin_(data);
  const sharedState = normalizeWorkspaceSharedState_(data.sharedState);
  if (!sharedState) return { success: false, error: '共有設定の形式が正しくありません。' };
  const serialized = JSON.stringify(sharedState);
  if (serialized.length > WORKSPACE_CONFIG_MAX_LENGTH) {
    return { success: false, error: '共有設定の容量が上限を超えています。カードを整理してください。' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: '別の端末が保存中です。少し待ってから再度お試しください。' };
  try {
    const sheet = getOrCreateSheet(WORKSPACE_CONFIG_SHEET_NAME, ['キー','設定JSON','更新日時','更新者コード','更新者名','版']);
    const current = readWorkspaceConfig_(sheet);
    const row = getWorkspaceConfigRow_(sheet) || Math.max(2, sheet.getLastRow() + 1);
    const version = current.version + 1;
    const updatedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, 6).setValues([[
      WORKSPACE_CONFIG_KEY,
      serialized,
      updatedAt,
      verified.auth.code,
      verified.auth.name,
      version
    ]]);
    SpreadsheetApp.flush();
    return { success: true, sharedState: sharedState, version: version, updatedAt: updatedAt, updatedBy: verified.auth.name, expiresAt: verified.expiresAt };
  } finally {
    lock.releaseLock();
  }
}
