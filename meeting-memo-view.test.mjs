import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = '';
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
}

const context = {
  document: { createElement: tag => new FakeElement(tag) },
  globalThis: null,
};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync('assets/js/meeting-memo-view.js', 'utf8'), context);
const view = context.StepMeetingMemoView;

const rows = [
  { id: '1', date: '2026-10-20', updatedAt: '2026-10-20T09:00:00Z', counterpart: '本人', staff: 'A', content: '古い\n本文' },
  { id: '2', date: '2026-10-21', updatedAt: '2026-10-21T08:00:00Z', counterpart: '保護者', staff: 'B', content: '新しい本文' },
  { id: '3', date: '2026-10-20', updatedAt: '2026-10-20T10:00:00Z', counterpart: '', staff: '', content: '' },
];
assert.deepEqual(Array.from(view.sortNewest(rows), row => row.id), ['2', '3', '1']);

const container = new FakeElement('div');
const rendered = view.render(container, rows);
assert.equal(rendered.length, 3, '全件を描画する');
assert.equal(container.children.length, 3, '5件などの件数制限を設けない');
assert.equal(container.children[0].children[0].textContent, '2026-10-21　相手: 保護者　担当: B');
assert.equal(container.children[2].children[1].textContent, '古い\n本文', '改行を含む本文を保持する');

const empty = new FakeElement('div');
view.render(empty, [], { emptyText: '面談メモはまだ登録されていません。' });
assert.equal(empty.children[0].textContent, '面談メモはまだ登録されていません。');

const admin = fs.readFileSync('admin.html', 'utf8');
const refreshAt = admin.indexOf('id="cmpMeetingRefresh"');
const toggleAt = admin.indexOf('id="cmpMeetingToggle"');
const editAt = admin.indexOf('id="cmpMeetingEdit"');
assert.ok(refreshAt >= 0 && refreshAt < toggleAt && toggleAt < editAt, '3ボタンを指定順で配置する');
assert.match(admin, /meeting_memo\.html\?studentId=\$\{encodeURIComponent\(sid\)\}/, '選択中の生徒IDを編集画面へ渡す');
assert.match(admin, /const preserveExisting = compareMeetingLoaded;/, '再取得エラー時に既存表示を保持する');
assert.match(admin, /compareMeetingStudentId !== sid[\s\S]*compareMeetingHidden = false;/, '生徒切替時に表示状態を戻す');
assert.match(admin, /if \(name === 'compare'\) \{[\s\S]*?compareMeetingHidden = false;[\s\S]*?initCompare\(\);[\s\S]*?\}/, '成績ページ再表示時に表示状態を戻す');
assert.doesNotMatch(admin, /list\.slice\(0, 5\)/, '成績管理で面談メモを5件に制限しない');

const directory = fs.readFileSync('student_directory.html', 'utf8');
assert.match(directory, /StepMeetingMemoView\.render\(area,rows/, '生徒情報検索も共通描画を利用する');
assert.match(directory, /function mount\(card,student\) \{\s*memosHidden=false;/, '生徒情報検索も生徒切替時に表示状態を戻す');

for (const [name, html] of [['admin.html', admin], ['student_directory.html', directory]]) {
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: name }), `${name} のインラインJavaScript構文`);
  }
}

console.log('meeting memo view contract: ok');
