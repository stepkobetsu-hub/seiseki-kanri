import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin = fs.readFileSync('admin.html', 'utf8');
const directory = fs.readFileSync('student_directory.html', 'utf8');

const compareSection = admin.match(/<div id="aTab_compare"[\s\S]*?<div id="cmpWishCard"/)?.[0] || '';
assert.match(compareSection, /class="btn btn-sm pageDirectoryShortcut" href="student_directory\.html">生徒情報検索へ<\/a>/);

const studentSection = admin.match(/<div id="aTab_students"[\s\S]*?<!-- 面談・メモ -->/)?.[0] || '';
assert.match(studentSection, /<div class="cardHead"><span>👥 生徒一覧・印刷<\/span><a class="btn btn-sm pageDirectoryShortcut" href="student_directory\.html">生徒情報検索へ<\/a><\/div>/);

const searchTitle = directory.match(/<div class="searchTitle">[\s\S]*?<div class="row searchRow">/)?.[0] || '';
assert.match(searchTitle, /class="btn directoryGradeLink gradeManagementShortcut" href="admin\.html#compare">📊 成績管理システムへ<\/a>/);
assert.doesNotMatch(searchTitle, /<br\s*\/?\s*>/i, '検索見出しに新しい行を追加しない');

console.log('navigation shortcut tests passed');
