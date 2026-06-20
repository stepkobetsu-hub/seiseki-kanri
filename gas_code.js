// ===================================================
// 塾成績管理システム - Google Apps Script
// ===================================================

// ★ 以下2つのIDを設定してください
const MASTER_SPREADSHEET_ID = '1CIJkTlYUcUkbb8jBdFc6L8D5ubTGsxwNxFv01ten-Zk'; // 生徒マスタ元ファイル
const DATA_SPREADSHEET_ID   = '1Zq3AbL9Fx_skBUibh2F73kyWlw9Ionh3-dTOtots0D8'; // 成績管理用

const MASTER_SHEET_NAME = '☆マスタ';
const TARGET_GRADES     = ['中1', '中2', '中3'];

// ===================================================
// シート取得 / 初期化
// ===================================================

function getDataSS() { return SpreadsheetApp.openById(DATA_SPREADSHEET_ID); }

function getOrCreateSheet(name, headers) {
  const ss = getDataSS();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureSheets() {
  getOrCreateSheet('生徒マスタ', ['生徒ID','氏名','校舎','学年','中学校','パスワード','在籍フラグ','最終同期日時']);
  getOrCreateSheet('学校マスタ', ['学校名','年間テスト回数','学期制','登録日時']);
  getOrCreateSheet('成績データ', [
    '生徒ID','氏名','校舎','学年','中学校','年度','テスト回次',
    '国語','社会','数学','理科','英語','5科目合計','5科目順位',
    '音楽','美術','保健体育','技術家庭','9科目合計','9科目順位',
    '登録日時','更新日時',
    '平均_国語','平均_社会','平均_数学','平均_理科','平均_英語','平均_5科目合計'
  ]);
  getOrCreateSheet('通知表データ', [
    '生徒ID','氏名','校舎','学年','中学校','年度','学期',
    '国語','社会','数学','理科','英語',
    '音楽','美術','保健体育','技術家庭',
    '登録日時','更新日時'
  ]);
  getOrCreateSheet('同期ログ', ['日時','種別','内容']);
}

// ===================================================
// Web API エントリーポイント
// ===================================================

function doGet(e)  { return route(e); }
function doPost(e) { return route(e); }

function route(e) {
  const p = e.parameter || {};
  const body = (e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
  const data = Object.assign({}, p, body);

  let result;
  try {
    ensureSheets();
    switch (data.action) {
      // 認証・生徒
      case 'login':              result = login(data); break;
      case 'getStudentScores':   result = getStudentScores(data); break;
      case 'saveScore':          result = saveScore(data); break;
      case 'deleteScore':        result = deleteScore(data); break;
      // 学校マスタ
      case 'getSchools':         result = getSchools(); break;
      case 'addSchool':          result = addSchool(data); break;
      case 'deleteSchool':       result = deleteSchool(data); break;
      case 'updateSchool':       result = updateSchool(data); break;
      // 管理者
      case 'getStudents':        result = getStudents(); break;
      case 'getAllScores':        result = getAllScores(data); break;
      case 'getStudentDetail':   result = getStudentDetail(data); break;
      // 通知表
      case 'getReport':          result = getReport(data); break;
      case 'saveReport':         result = saveReport(data); break;
      case 'getReports':         result = getReports(data); break;
      case 'getAllReports':      result = getAllReports(data); break;
      // 同期
      case 'syncStudents':       result = syncStudentsFromMaster(data); break;
      case 'applySyncResult':    result = applySyncResult(data); break;
      case 'getSyncLog':         result = getSyncLog(); break;
      // 志望校
      case 'saveWish':           result = saveWish(data); break;
      case 'saveWishResult':     result = saveWishResult(data); break;
      case 'getWish':            result = getWish(data); break;
      case 'getAllWishes':        result = getAllWishes(data); break;
      default: result = { success: false, error: '不明なアクション: ' + data.action };
    }
  } catch(err) {
    result = { success: false, error: err.message, stack: err.stack };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================================================
// 認証
// ===================================================

function login(data) {
  const sh = getOrCreateSheet('生徒マスタ', []);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [id, name, campus, grade, school, pass, flag] = rows[i];
    if (String(id) === String(data.studentId) && String(pass) === String(data.password)) {
      if (flag === '' || flag === null) return { success: false, error: 'このアカウントは無効です' };
      return { success: true, student: { id, name, campus, grade, school } };
    }
  }
  return { success: false, error: 'IDまたはパスワードが違います' };
}

// ===================================================
// 成績データ
// ===================================================

function getStudentScores(data) {
  const sh = getOrCreateSheet('成績データ', []);
  const rows = sh.getDataRange().getValues();
  const scores = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId)) scores.push(rowToScore(rows[i]));
  }
  return { success: true, scores };
}

function deleteScore(data) {
  const sh = SpreadsheetApp.openById(DATA_SPREADSHEET_ID).getSheetByName('成績データ');
  if (!sh) return { success: false, error: 'シートが見つかりません' };
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(data.studentId) &&
        String(rows[i][4]) === String(data.year) &&
        String(rows[i][5]) === String(data.term)) {
      sh.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'データが見つかりません' };
}

function saveScore(data) {
  const sh = getOrCreateSheet('成績データ', []);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toLocaleString('ja-JP');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId) &&
        String(rows[i][5]) === String(data.year) &&
        String(rows[i][6]) === String(data.term)) {
      const kept = rows[i][20]; // 登録日時はそのまま
      sh.getRange(i + 1, 1, 1, 28).setValues([buildScoreRow(data, kept, now)]);
      return { success: true, message: '更新しました' };
    }
  }
  sh.appendRow(buildScoreRow(data, now, now));
  return { success: true, message: '保存しました' };
}

function buildScoreRow(d, created, updated) {
  return [
    d.studentId, d.name, d.campus, d.grade, d.school, d.year, d.term,
    n(d.jpn), n(d.soc), n(d.math), n(d.sci), n(d.eng), n(d.total5), n(d.rank5),
    n(d.mus), n(d.art), n(d.pe), n(d.tech), n(d.total9), n(d.rank9),
    created, updated,
    n(d.avg_jpn), n(d.avg_soc), n(d.avg_math), n(d.avg_sci), n(d.avg_eng), n(d.avg_total5)
  ];
}

function rowToScore(r) {
  return {
    studentId: r[0], name: r[1], campus: r[2], grade: r[3], school: r[4],
    year: r[5], term: r[6],
    jpn: r[7], soc: r[8], math: r[9], sci: r[10], eng: r[11],
    total5: r[12], rank5: r[13],
    mus: r[14], art: r[15], pe: r[16], tech: r[17],
    total9: r[18], rank9: r[19],
    createdAt: r[20], updatedAt: r[21],
    avg_jpn: r[22]||'', avg_soc: r[23]||'', avg_math: r[24]||'',
    avg_sci: r[25]||'', avg_eng: r[26]||'', avg_total5: r[27]||''
  };
}

function n(v) { if (v === '' || v == null) return ''; const x = Number(v); return isNaN(x) ? '' : x; }

// ===================================================
// 学校マスタ
// ===================================================

function getSchools() {
  const sh = getOrCreateSheet('学校マスタ', []);
  const rows = sh.getDataRange().getValues();
  const schools = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) schools.push({ name: rows[i][0], termCount: rows[i][1], semType: rows[i][2] || '3term', createdAt: rows[i][3] });
  }
  return { success: true, schools };
}

function addSchool(data) {
  const sh = getOrCreateSheet('学校マスタ', []);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.name) return { success: false, error: '同じ学校名がすでに存在します' };
  }
  sh.appendRow([data.name, Number(data.termCount), data.semType || '3term', new Date().toLocaleString('ja-JP')]);
  return { success: true };
}

function deleteSchool(data) {
  const sh = getOrCreateSheet('学校マスタ', []);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.name) { sh.deleteRow(i + 1); return { success: true }; }
  }
  return { success: false, error: '学校が見つかりません' };
}

function updateSchool(data) {
  const sh = getOrCreateSheet('学校マスタ', []);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.name) {
      sh.getRange(i + 1, 2).setValue(Number(data.termCount));
      sh.getRange(i + 1, 3).setValue(data.semType || rows[i][2] || '3term');
      return { success: true };
    }
  }
  return { success: false, error: '学校が見つかりません' };
}

// ===================================================
// 管理者：生徒一覧・全成績
// ===================================================

function getStudents() {
  const sh = getOrCreateSheet('生徒マスタ', []);
  const rows = sh.getDataRange().getValues();
  const students = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      students.push({
        id: rows[i][0], name: rows[i][1], campus: rows[i][2],
        grade: rows[i][3], school: rows[i][4], flag: rows[i][6], syncedAt: rows[i][7]
      });
    }
  }
  return { success: true, students };
}

function getAllScores(data) {
  const sh = getOrCreateSheet('成績データ', []);
  const rows = sh.getDataRange().getValues();
  const scores = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const s = rowToScore(rows[i]);
    if (data.year && String(s.year) !== String(data.year)) continue;
    if (data.term && String(s.term) !== String(data.term)) continue;
    if (data.campus && s.campus !== data.campus) continue;
    scores.push(s);
  }
  return { success: true, scores };
}

function getStudentDetail(data) {
  const scoresSh = getOrCreateSheet('成績データ', []);
  const rows = scoresSh.getDataRange().getValues();
  const scores = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId)) scores.push(rowToScore(rows[i]));
  }
  return { success: true, scores };
}

// ===================================================
// 生徒マスタ同期
// ===================================================

function syncStudentsFromMaster(data) {
  // 元ファイルから読み込み
  const masterSS = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
  const masterSh = masterSS.getSheetByName(MASTER_SHEET_NAME);
  if (!masterSh) return { success: false, error: `シート「${MASTER_SHEET_NAME}」が見つかりません` };

  const masterRows = masterSh.getDataRange().getValues();

  // ヘッダー行から列インデックスを自動検出
  const headers = masterRows[0].map(h => String(h).trim());
  const col = (keywords) => {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const colId     = col(['ID','id','コード','番号','生徒番号','生徒ID']);
  const colFlag   = col(['在籍','フラグ','status','ステータス','数']);
  const colName   = col(['氏名','名前','生徒名','name']);
  const colCampus = col(['校舎','キャンパス','campus']);
  const colGrade  = col(['学年','grade']);
  const colPass   = col(['パスワード','pass','PW','pw']);
  const colSchool = col(['中学','在学','学校','school']);

  // 対象行を抽出（ヘッダー行をスキップ）
  const masterStudents = {};
  for (let i = 1; i < masterRows.length; i++) {
    const row = masterRows[i];
    const id    = colId >= 0     ? String(row[colId]).trim()     : String(row[0]).trim();
    const flag  = colFlag >= 0   ? row[colFlag]                  : row[1];
    const name  = colName >= 0   ? String(row[colName]).trim()   : String(row[4]).trim();
    const campus= colCampus >= 0 ? String(row[colCampus]).trim() : String(row[7]).trim();
    const grade = colGrade >= 0  ? String(row[colGrade]).trim()  : String(row[9]).trim();
    const pass  = colPass >= 0   ? String(row[colPass]).trim()   : String(row[11]).trim();
    const school= colSchool >= 0 ? String(row[colSchool]).trim() : String(row[15]).trim();

    if (!id || id === 'undefined' || id === '') continue;
    const flagVal = String(flag).trim();
    if (flagVal === '') continue;

    // 学年フィルタ（全角半角両対応）
    const normGrade = grade.replace(/１/g,'1').replace(/２/g,'2').replace(/３/g,'3');
    const normTargets = TARGET_GRADES.map(g => g.replace(/１/g,'1').replace(/２/g,'2').replace(/３/g,'3'));
    if (!normTargets.includes(normGrade)) continue;

    masterStudents[id] = { id, name, campus, grade, school, pass, flag: flagVal };
  }

  // 現在の成績管理側の生徒マスタ
  const localSh = getOrCreateSheet('生徒マスタ', []);
  const localRows = localSh.getDataRange().getValues();
  const localStudents = {};
  for (let i = 1; i < localRows.length; i++) {
    if (!localRows[i][0]) continue;
    localStudents[String(localRows[i][0])] = {
      id: localRows[i][0], name: localRows[i][1], campus: localRows[i][2],
      grade: localRows[i][3], school: localRows[i][4], pass: localRows[i][5],
      flag: String(localRows[i][6]), row: i + 1
    };
  }

  // 差分を計算
  const toAdd = [];
  const toUpdate = [];
  const passChanged = [];
  const toDeactivate = []; // 元データで空になった生徒

  for (const [id, ms] of Object.entries(masterStudents)) {
    if (!localStudents[id]) {
      toAdd.push(ms);
    } else {
      const ls = localStudents[id];
      const changed = [];
      if (ms.name !== ls.name) changed.push(`氏名: ${ls.name}→${ms.name}`);
      if (ms.campus !== ls.campus) changed.push(`校舎: ${ls.campus}→${ms.campus}`);
      if (ms.grade !== ls.grade) changed.push(`学年: ${ls.grade}→${ms.grade}`);
      if (ms.school !== ls.school) changed.push(`中学校: ${ls.school}→${ms.school}`);
      if (ms.flag !== ls.flag) changed.push(`在籍フラグ: ${ls.flag}→${ms.flag}`);
      if (ms.pass !== ls.pass) {
        passChanged.push({ id, name: ms.name, oldPass: ls.pass, newPass: ms.pass });
      }
      if (changed.length > 0 || ms.pass !== ls.pass) {
        toUpdate.push({ ...ms, changes: changed });
      }
    }
  }

  // 元データに存在しなくなった（空欄になった）生徒
  for (const [id, ls] of Object.entries(localStudents)) {
    if (!masterStudents[id]) {
      toDeactivate.push({ id, name: ls.name, campus: ls.campus, grade: ls.grade });
    }
  }

  return {
    success: true,
    preview: { toAdd, toUpdate, passChanged, toDeactivate },
    masterCount: Object.keys(masterStudents).length,
    localCount: Object.keys(localStudents).length
  };
}

function applySyncResult(data) {
  const sh = getOrCreateSheet('生徒マスタ', []);
  const logSh = getOrCreateSheet('同期ログ', []);
  const now = new Date().toLocaleString('ja-JP');
  const rows = sh.getDataRange().getValues();

  // インデックス作成
  const idToRow = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) idToRow[String(rows[i][0])] = i + 1;
  }

  const { toAdd, toUpdate, toDeactivate, deleteDeactivated } = data;
  const logs = [];

  // 追加
  if (toAdd && toAdd.length > 0) {
    toAdd.forEach(s => {
      sh.appendRow([s.id, s.name, s.campus, s.grade, s.school, s.pass, s.flag, now]);
      logs.push([now, '追加', `${s.name}（${s.id}）`]);
    });
  }

  // 更新（氏名・校舎・学年・中学校・フラグ・パスワード）
  if (toUpdate && toUpdate.length > 0) {
    // 最新行インデックスを再取得
    const freshRows = sh.getDataRange().getValues();
    const freshIdx = {};
    for (let i = 1; i < freshRows.length; i++) {
      if (freshRows[i][0]) freshIdx[String(freshRows[i][0])] = i + 1;
    }
    toUpdate.forEach(s => {
      const rn = freshIdx[String(s.id)];
      if (!rn) return;
      sh.getRange(rn, 1, 1, 8).setValues([[s.id, s.name, s.campus, s.grade, s.school, s.pass, s.flag, now]]);
      logs.push([now, '更新', `${s.name}（${s.id}）: ${(s.changes || []).join(', ')}`]);
    });
  }

  // 退塾処理
  if (toDeactivate && toDeactivate.length > 0) {
    const freshRows2 = sh.getDataRange().getValues();
    const freshIdx2 = {};
    for (let i = 1; i < freshRows2.length; i++) {
      if (freshRows2[i][0]) freshIdx2[String(freshRows2[i][0])] = i + 1;
    }

    // 削除対象のIDをソートして後ろから削除（行番号ずれ防止）
    const sortedDeactivate = [...toDeactivate].sort((a, b) => {
      return (freshIdx2[String(b.id)] || 0) - (freshIdx2[String(a.id)] || 0);
    });

    sortedDeactivate.forEach(s => {
      const rn = freshIdx2[String(s.id)];
      if (!rn) return;
      if (deleteDeactivated) {
        sh.deleteRow(rn);
        logs.push([now, '削除', `${s.name}（${s.id}）`]);
      } else {
        // フラグを'退塾'に変更（行は残す）
        sh.getRange(rn, 7).setValue('退塾');
        sh.getRange(rn, 8).setValue(now);
        logs.push([now, '退塾マーク', `${s.name}（${s.id}）`]);
      }
    });
  }

  // ログ書き込み
  if (logs.length > 0) logSh.getRange(logSh.getLastRow() + 1, 1, logs.length, 3).setValues(logs);

  return { success: true, applied: logs.length };
}

function getSyncLog() {
  const sh = getOrCreateSheet('同期ログ', []);
  const rows = sh.getDataRange().getValues();
  const logs = [];
  for (let i = Math.max(1, rows.length - 50); i < rows.length; i++) {
    if (rows[i][0]) logs.push({ time: rows[i][0], type: rows[i][1], detail: rows[i][2] });
  }
  return { success: true, logs: logs.reverse() };
}

// ===================================================
// トリガー：毎日自動同期（差分があれば適用）
// ===================================================

function autoSync() {
  try {
    const result = syncStudentsFromMaster({});
    if (!result.success) { writeSyncError(result.error); return; }

    const { toAdd, toUpdate, toDeactivate } = result.preview;
    const total = toAdd.length + toUpdate.length;

    if (total === 0 && toDeactivate.length === 0) return; // 変更なし

    // 自動同期では退塾は削除せず「退塾マーク」のみ（削除は手動確認）
    applySyncResult({
      toAdd, toUpdate, toDeactivate,
      deleteDeactivated: false
    });
  } catch(e) {
    writeSyncError(e.message);
  }
}

function writeSyncError(msg) {
  const sh = getOrCreateSheet('同期ログ', []);
  sh.appendRow([new Date().toLocaleString('ja-JP'), 'エラー', msg]);
}

// ===================================================
// トリガー設定ヘルパー（一度だけ手動実行してください）
// ===================================================

function setupTriggers() {
  // 既存トリガー削除
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  // 毎日午前2時に自動同期
  ScriptApp.newTrigger('autoSync')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  Logger.log('トリガーを設定しました（毎日午前2時に自動同期）');
}

// ===================================================
// 通知表
// ===================================================

const REPORT_COLS = ['生徒ID','氏名','校舎','学年','中学校','年度','学期',
  '国語','社会','数学','理科','英語','音楽','美術','保健体育','技術家庭','登録日時','更新日時'];

function getReport(data) {
  const sh = getOrCreateSheet('通知表データ', REPORT_COLS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId) &&
        String(rows[i][5]) === String(data.year) &&
        rows[i][6] === data.semester) {
      return { success: true, data: rowToReport(rows[i]) };
    }
  }
  return { success: true, data: {} };
}

function getReports(data) {
  const sh = getOrCreateSheet('通知表データ', REPORT_COLS);
  const rows = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId)) {
      result.push(rowToReport(rows[i]));
    }
  }
  result.sort((a, b) => a.year !== b.year ? a.year - b.year : 0);
  return { success: true, data: result };
}

function saveReport(data) {
  const sh = getOrCreateSheet('通知表データ', REPORT_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toLocaleString('ja-JP');
  // 生徒情報を生徒マスタから取得
  const stSh = getOrCreateSheet('生徒マスタ', []);
  const stRows = stSh.getDataRange().getValues();
  let name='', campus='', grade='', school='';
  for (let i = 1; i < stRows.length; i++) {
    if (String(stRows[i][0]) === String(data.studentId)) {
      [,name,campus,grade,school] = stRows[i]; break;
    }
  }
  const newRow = [
    data.studentId, name, campus, grade, school, data.year, data.semester,
    data.rp_jpn||'', data.rp_soc||'', data.rp_math||'', data.rp_sci||'', data.rp_eng||'',
    data.rp_mus||'', data.rp_art||'', data.rp_pe||'', data.rp_tech||'',
    now, now
  ];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId) &&
        String(rows[i][5]) === String(data.year) &&
        rows[i][6] === data.semester) {
      newRow[16] = rows[i][16]; // 登録日時を保持
      sh.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return { success: true };
    }
  }
  sh.appendRow(newRow);
  return { success: true };
}

function getAllReports(data) {
  const sh = getOrCreateSheet('通知表データ', REPORT_COLS);
  const rows = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const r = rowToReport(rows[i]);
    if (data.year && String(r.year) !== String(data.year)) continue;
    if (data.semester && r.semester !== data.semester) continue;
    if (data.campus && r.campus !== data.campus) continue;
    if (data.grade) {
      const g = data.grade.replace('中','中');
      if (r.grade !== g && r.grade !== data.grade) continue;
    }
    result.push(r);
  }
  return { success: true, data: result };
}

function rowToReport(row) {
  return {
    studentId: row[0], name: row[1], campus: row[2], grade: row[3], school: row[4],
    year: row[5], semester: row[6],
    rp_jpn: row[7], rp_soc: row[8], rp_math: row[9], rp_sci: row[10], rp_eng: row[11],
    rp_mus: row[12], rp_art: row[13], rp_pe: row[14], rp_tech: row[15]
  };
}

// ===================================================
// 志望校
// ===================================================
const WISH_COLS = [
  '生徒ID','氏名','校舎','学年',
  '公立1校名','公立1学科','公立2校名','公立2学科','公立3校名','公立3学科',
  '私立1校名','私立1学科','私立2校名','私立2学科','私立3校名','私立3学科',
  '登録日時','更新日時','合否結果'
];

function saveWishResult(data) {
  const sh = getOrCreateSheet('志望校データ', WISH_COLS);
  const rows = sh.getDataRange().getValues();
  // results列がなければ追加（19列目）
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId)) {
      const resultsStr = rows[i][18] || '{}';
      let results = {};
      try { results = JSON.parse(resultsStr); } catch(e) {}
      results[data.key] = data.value;
      // 19列目にJSON保存（なければ追加）
      if (sh.getLastColumn() < 19) sh.getRange(1, 19).setValue('合否結果');
      sh.getRange(i + 1, 19).setValue(JSON.stringify(results));
      sh.getRange(i + 1, 18).setValue(new Date().toLocaleString('ja-JP'));
      return { success: true };
    }
  }
  return { success: false, error: '生徒が見つかりません' };
}

function saveWish(data) {
  const sh = getOrCreateSheet('志望校データ', WISH_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toLocaleString('ja-JP');
  const stSh = getOrCreateSheet('生徒マスタ', []);
  const stRows = stSh.getDataRange().getValues();
  let name='', campus='', grade='';
  for (let i = 1; i < stRows.length; i++) {
    if (String(stRows[i][0]) === String(data.studentId)) {
      name=stRows[i][1]; campus=stRows[i][2]; grade=stRows[i][3]; break;
    }
  }
  const newRow = [
    data.studentId, name, campus, grade,
    data.pub1name||'', data.pub1dept||'',
    data.pub2name||'', data.pub2dept||'',
    data.pub3name||'', data.pub3dept||'',
    data.pri1name||'', data.pri1dept||'',
    data.pri2name||'', data.pri2dept||'',
    data.pri3name||'', data.pri3dept||'',
    now, now,
    data.results||'{}'  // 合否JSON
  ];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId)) {
      newRow[16] = rows[i][16];
      sh.getRange(i+1, 1, 1, newRow.length).setValues([newRow]);
      return { success: true };
    }
  }
  sh.appendRow(newRow);
  return { success: true };
}

function getWish(data) {
  const sh = getOrCreateSheet('志望校データ', WISH_COLS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.studentId)) {
      return { success: true, wish: rowToWish(rows[i]) };
    }
  }
  return { success: true, wish: null };
}

function getAllWishes(data) {
  const sh = getOrCreateSheet('志望校データ', WISH_COLS);
  const rows = sh.getDataRange().getValues();
  const wishes = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const w = rowToWish(rows[i]);
    if (data.campus && w.campus !== data.campus) continue;
    if (data.grade && w.grade !== data.grade) continue;
    wishes.push(w);
  }
  return { success: true, wishes };
}

function rowToWish(r) {
  let results = {};
  try { if (r[18]) results = JSON.parse(r[18]); } catch(e) {}
  return {
    studentId:r[0], name:r[1], campus:r[2], grade:r[3],
    pub1name:r[4], pub1dept:r[5], pub2name:r[6], pub2dept:r[7], pub3name:r[8], pub3dept:r[9],
    pri1name:r[10], pri1dept:r[11], pri2name:r[12], pri2dept:r[13], pri3name:r[14], pri3dept:r[15],
    createdAt:r[16], updatedAt:r[17], results
  };
}
