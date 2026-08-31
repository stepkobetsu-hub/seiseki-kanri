import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./juku_app.html', import.meta.url), 'utf8');
const storage = readFileSync(new URL('./supabase/functions/seiseki-runtime-v1/storage.ts', import.meta.url), 'utf8');

test('runtime CORS contract accepts POST and OPTIONS', () => {
  assert.match(storage, /'Access-Control-Allow-Methods': 'POST, OPTIONS'/);
  assert.match(storage, /request\.method === 'OPTIONS'/);
});

test('wish save and seed helper persists parsed results separately', () => {
  assert.match(storage, /results: parseWishResults\(payload\.results\)/);
  assert.match(storage, /from\('school_preferences'\)/);
  assert.match(storage, /Used by both saveWish and the getWish read-through seed path/);
  assert.match(storage, /original payload to the legacy GAS mirror/);
});

test('Supabase writes never fall back to a legacy success', () => {
  assert.match(html, /if \(isWrite\) return \{ success: false, code: 'SUPABASE_UNAVAILABLE'/);
  assert.match(html, /Content-Type': 'text\/plain;charset=UTF-8'/);
  assert.doesNotMatch(html, /if \(response\.status >= 500\) return legacyStudentGradeRequest/);
});
