import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./admin.html', import.meta.url), 'utf8');
const config = readFileSync(new URL('./assets/js/supabase-config.js', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('./supabase/functions/seiseki-admin-runtime-v1/index.ts', import.meta.url), 'utf8');

test('admin uses the active learning-progress project and never references the inactive project', () => {
  assert.match(config, /wisedgcgwaebtkprdhth/);
  assert.doesNotMatch(config + html + runtime, /lrairqewdnyfxrydirrm/);
  assert.match(html, /SEISEKI_ADMIN_CUTOVER_VERSION/);
  assert.match(html, /setItem\('seisekiDataSource', 'supabase'\)/);
});

test('admin runtime revalidates STEP staff sessions and enforces permission levels', () => {
  assert.match(runtime, /action: 'verifySystemPortal'/);
  assert.match(runtime, /ADMIN_PERMISSION_LEVELS = new Set\(\['2', '3', '4'\]\)/);
  assert.match(runtime, /ADMIN_FORBIDDEN/);
  assert.doesNotMatch(runtime, /user_metadata|supabaseSignIn|\/auth\/v1\/token/);
});

test('browser sends the common staff token to the Edge Function without a service key', () => {
  assert.match(html, /systemPortalSessionToken/);
  assert.match(html, /token:session\.token/);
  assert.match(html, /seiseki-admin-runtime-v1/);
  assert.doesNotMatch(config + html, /sb_secret_[A-Za-z0-9_-]+|serviceRoleKey\s*[:=]/i);
});

test('all grade admin actions route through the runtime', () => {
  for (const action of ['getStudents','getStudentList','getAllScores','getStudentScores','saveScore','deleteScore','getAllReports','getReports','saveReport','deleteReport','getAllWishes','getWish','saveWish','saveWishResult','getSchools','addSchool','updateSchool','deleteSchool']) {
    assert.match(html, new RegExp(`['"]${action}['"]`));
    assert.match(runtime, new RegExp(`['"]${action}['"]`));
  }
});

test('writes require mutation IDs, do not fall back, and report mirror state separately', () => {
  assert.match(runtime, /MUTATION_ID_REQUIRED/);
  assert.match(runtime, /mirrorStatus: 'queued'/);
  assert.match(html, /fallback:!SUPABASE_WRITE_ACTIONS\.has\(data\.action\)/);
  assert.match(runtime, /source: 'supabase'/);
});

test('public grade tables retain RLS and views use security invoker', () => {
  const schema = readFileSync(new URL('./supabase/schema.sql', import.meta.url), 'utf8');
  for (const table of ['students','test_scores','report_cards','school_preferences']) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.equal((schema.match(/with \(security_invoker = true\)/g) || []).length >= 3, true);
});
