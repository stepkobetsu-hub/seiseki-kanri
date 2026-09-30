// Bind this adapter into the existing 過去問保管DB project; do not change existing passwords.
// Hooks in コード.gs:
// doGet: load/getSchools -> json(pastExamFast_(action,p.pass||''))
// doPost: savePatch (after PASS_USER/PASS_ADMIN validation) -> json(pastExamFast_('savePatch',pass,JSON.parse(p.payload||'[]')))
// Replace getDataRange().getValues() used for registered metadata with pastExamRows_().
// Replace existing saveAllData/upsertRow implementations with those below.
const PAST_EXAM_FAST_URL = 'https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/past-exam-runtime-v1';
function pastExamFast_(action,pass,payload) {
  const response=UrlFetchApp.fetch(PAST_EXAM_FAST_URL,{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({action:action,pass:pass,payload:payload})});
  let result;
  try{result=JSON.parse(response.getContentText());}catch(e){throw new Error('新DBの応答形式エラー');}
  if(!result.ok)throw new Error(result.error||'新DBへの接続に失敗しました');
  return result;
}
function pastExamRows_() {
  const data=pastExamFast_('load',PASS_ADMIN).data;
  const rows=[['__schools__',JSON.stringify(data.schools)],['__deleted__',JSON.stringify(data.deletedFiles||[])]];
  Object.keys(data.db||{}).forEach(function(k){rows.push([k,JSON.stringify(data.db[k])]);});
  return rows;
}
function saveAllData(sheet,schools,db,deletedFiles) {
  return pastExamFast_('saveFull',PASS_ADMIN,{schools:schools,db:db,deletedFiles:deletedFiles||[]});
}
function upsertRow(sheet,key,value) {
  return pastExamFast_('saveRow',PASS_ADMIN,{key:key,value:JSON.parse(value)});
}
function exportPastExamBackupToSheet() {
  const rows=pastExamRows_(), sheet=getSheet(), previous=sheet.getLastRow();
  sheet.getRange(1,1,rows.length,2).setValues(rows);
  if(previous>rows.length)sheet.getRange(rows.length+1,1,previous-rows.length,2).clearContent();
}
