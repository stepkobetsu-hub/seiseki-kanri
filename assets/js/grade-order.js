(function (root) {
  'use strict';

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function semesterOrder(value) {
    const text = String(value == null ? '' : value).normalize('NFKC').trim();
    const number = Number((text.match(/\d+/) || [])[0]);
    if (Number.isFinite(number)) return number;
    return ({ '前期': 1, '後期': 2 })[text] || 0;
  }

  function compareScoreNewest(a, b) {
    return numberOrZero(b && b.year) - numberOrZero(a && a.year) ||
      numberOrZero(b && b.term) - numberOrZero(a && a.term);
  }

  function compareScoreOldest(a, b) {
    return -compareScoreNewest(a, b);
  }

  function compareReportNewest(a, b) {
    return numberOrZero(b && b.year) - numberOrZero(a && a.year) ||
      semesterOrder(b && b.semester) - semesterOrder(a && a.semester);
  }

  function compareReportOldest(a, b) {
    return -compareReportNewest(a, b);
  }

  root.StepGradeOrder = Object.freeze({
    semesterOrder,
    compareScoreNewest,
    compareScoreOldest,
    compareReportNewest,
    compareReportOldest,
    scoresNewest: rows => [...(rows || [])].sort(compareScoreNewest),
    reportsNewest: rows => [...(rows || [])].sort(compareReportNewest)
  });
})(typeof window !== 'undefined' ? window : globalThis);
