#!/usr/bin/env node

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, and ADMIN_PASSWORD are required.');
  process.exit(1);
}

const base = SUPABASE_URL.replace(/\/$/, '');
const targetCodes = ['TEST001', 'TEST002'];

async function signIn() {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
  if (!res.ok) {
    const message = typeof body === 'object' && body ? (body.msg || body.message || JSON.stringify(body)) : String(body || '');
    throw new Error(`Sign in failed: ${res.status} ${message}`);
  }
  return body.access_token;
}

async function fetchTargets(token) {
  const url = new URL(`${base}/rest/v1/students`);
  url.searchParams.set('select', 'student_code,name,campus,grade,active');
  url.searchParams.set('student_code', `in.(${targetCodes.join(',')})`);
  url.searchParams.set('order', 'student_code.asc');
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

async function deleteTargets(token) {
  const url = new URL(`${base}/rest/v1/students`);
  url.searchParams.set('student_code', `in.(${targetCodes.join(',')})`);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=representation'
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Delete failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}

const token = await signIn();
const before = await fetchTargets(token);
console.log('Before delete:');
console.table(before);

const deleted = await deleteTargets(token);
console.log('Deleted:');
console.table(deleted);

const after = await fetchTargets(token);
console.log('After delete:');
console.table(after);

if (after.length > 0) {
  console.error('TEST001 / TEST002 still remain.');
  process.exit(1);
}

console.log('Cleanup complete. TEST001 / TEST002 are no longer in Supabase students.');
