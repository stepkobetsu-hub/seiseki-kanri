#!/usr/bin/env node
/*
  Supabase table backup to JSON files.

  Required env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
  Optional:
    BACKUP_DIR=backups/YYYY-MM-DD
*/

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = process.env.BACKUP_DIR || `backups/${new Date().toISOString().slice(0, 10)}`;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const tables = [
  'students',
  'test_scores',
  'report_cards',
  'school_preferences',
  'meeting_memos',
  'schools',
  'staff_members',
  'entry_documents',
  'sync_logs'
];

async function readTable(table) {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Backup ${table} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

await mkdir(BACKUP_DIR, { recursive: true });

const summary = {};
for (const table of tables) {
  const rows = await readTable(table);
  summary[table] = rows.length;
  await writeFile(join(BACKUP_DIR, `${table}.json`), JSON.stringify(rows, null, 2), 'utf8');
}

await writeFile(join(BACKUP_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify({ backup_dir: BACKUP_DIR, ...summary }, null, 2));
