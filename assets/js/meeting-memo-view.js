(function (root) {
  'use strict';

  function memoTime(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const parsed = Date.parse(text.replace(/\//g, '-'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function sortNewest(rows) {
    return [...(Array.isArray(rows) ? rows : [])].sort((a, b) =>
      memoTime(b.date) - memoTime(a.date) ||
      memoTime(b.updatedAt) - memoTime(a.updatedAt) ||
      memoTime(b.createdAt) - memoTime(a.createdAt) ||
      String(b.id || '').localeCompare(String(a.id || ''), 'ja', { numeric: true })
    );
  }

  function displayDate(value) {
    const text = String(value || '').trim();
    if (!text) return '－';
    const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : text;
  }

  function make(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }

  function render(container, rows, options) {
    const settings = options || {};
    const sorted = sortNewest(rows);
    container.replaceChildren();
    if (!sorted.length) {
      container.append(make('p', settings.emptyText || '面談メモはまだ登録されていません。', 'muted'));
      return sorted;
    }
    for (const memo of sorted) {
      const item = make('article', null, 'academicMemo');
      item.append(
        make('div', `${displayDate(memo.date)}　相手: ${memo.counterpart || '－'}　担当: ${memo.staff || '－'}`, 'academicMemoMeta'),
        make('div', memo.content || '', 'academicMemoContent')
      );
      container.append(item);
    }
    return sorted;
  }

  root.StepMeetingMemoView = Object.freeze({ displayDate, render, sortNewest });
})(typeof window === 'undefined' ? globalThis : window);
