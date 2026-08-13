const MASTER_SS_ID = '1L5aFDXAmfUDkBg8d7X3WqJgMhdMq5tM5sfUZ2G-M58E';
const MASTER_SHEET = '講師マスター';
const ALLOWED_PERMISSIONS = ['2', '3', '4'];
const CSV_HEADERS = ['金融機関ｺｰﾄﾞ','金融機関ｶﾅ名','金融機関漢字名','支店ｺｰﾄﾞ','支店ｶﾅ名','支店漢字名','預金種目','口座番号','従業員ｶﾅ名','従業員漢字名','従業員ｺｰﾄﾞ1','従業員ｺｰﾄﾞ2','入力方式'];

function doGet() {
  return HtmlService.createHtmlOutput(APP_HTML)
    .setTitle('ゆうちょBIZ新規登録用従業員マスタ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function loginEmployeeMaster(code, password) {
  const result = callAuth_({action:'staffLogin', code:String(code || '').trim(), password:String(password || '')});
  if (!result.success) throw new Error(result.error || 'ログインできませんでした');
  const level = String(result.permissionLevel || '');
  if (!ALLOWED_PERMISSIONS.includes(level)) throw new Error('この機能を利用する権限がありません');
  const token = createEmployeeMasterSession_({
    code:String(code || '').trim(),
    name:result.name || '',
    permissionLevel:level
  });
  return {success:true, name:result.name || '', permissionLevel:level, token:token};
}

function verifyToken_(token) {
  const rawToken = String(token || '');
  if (!rawToken) throw new Error('ログインしてください。');
  const stored = PropertiesService.getScriptProperties().getProperty(employeeMasterSessionKey_(rawToken));
  if (!stored) throw new Error('ログイン情報を確認できません。もう一度ログインしてください。');
  let session;
  try { session = JSON.parse(stored); } catch (e) { throw new Error('ログイン情報を確認できません。もう一度ログインしてください。'); }
  if (!ALLOWED_PERMISSIONS.includes(String(session.permissionLevel || ''))) {
    throw new Error('この機能を利用する権限がありません');
  }
  return session;
}

function callAuth_(payload) {
  const res = UrlFetchApp.fetch(yuuchoEmployeeAuthApiUrl_(), {method:'post', contentType:'text/plain', payload:JSON.stringify(payload), muteHttpExceptions:true});
  try { return JSON.parse(res.getContentText()); } catch (e) { throw new Error('認証サーバーへ接続できませんでした'); }
}

function yuuchoEmployeeAuthApiUrl_() {
  return 'https://script.google.com/macros/s/AKfycbypkUc0MqZ07E7pZRglNPeRM56WbCcuWaLpRzi9bVFcPklHDxaaLC7GfzG6ozTGCbEX/exec';
}

function createEmployeeMasterSession_(staff) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(employeeMasterSessionKey_(token), JSON.stringify({
    code:staff.code,
    name:staff.name,
    permissionLevel:staff.permissionLevel,
    createdAt:new Date().toISOString()
  }));
  return token;
}

function employeeMasterSessionKey_(token) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8);
  return 'YUCHO_EMP_SESSION_' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function logoutEmployeeMaster(token) {
  const rawToken = String(token || '');
  if (rawToken) PropertiesService.getScriptProperties().deleteProperty(employeeMasterSessionKey_(rawToken));
  return {success:true};
}

function getEmployees(token) {
  verifyToken_(token);
  const sh = SpreadsheetApp.openById(MASTER_SS_ID).getSheetByName(MASTER_SHEET);
  if (!sh) throw new Error('講師マスターが見つかりません');
  const lastRow = sh.getLastRow();
  if (lastRow < 5) return [];
  const values = sh.getRange(5, 1, lastRow - 4, 11).getDisplayValues();
  return values.map(function(r) {
    const bankRaw = clean_(r[7]);
    const branchRaw = clean_(r[8]);
    const accountRaw = digits_(r[10]);
    const isYuucho = digits_(bankRaw) === '9900';
    const bank = bankPreset_(bankRaw);
    return {
      code:clean_(r[0]), name:clean_(r[1]), kana:halfKana_(r[2]), status:clean_(r[3]),
      bankCode:bank.code, bankKana:bank.kana, bankName:bank.name,
      branchCode:isYuucho ? yuuchoBranch_(branchRaw) : pad_(digits_(branchRaw), 3),
      branchKana:'', branchName:'', depositType:'1',
      // ゆうちょの「番号」は末尾1桁がチェック番号。元データが7桁でも必ず除く。
      accountNumber:isYuucho && accountRaw.length > 1 ? accountRaw.slice(0, -1) : pad_(accountRaw, 7),
      inputMethod:isYuucho ? '1' : '0', sourceBank:bankRaw, sourceBranch:branchRaw,
      warnings:employeeWarnings_(bankRaw, branchRaw, accountRaw, r[2])
    };
  }).filter(function(x) { return x.code && x.name; });
}

function bankPreset_(raw) {
  const d = digits_(raw);
  if (d === '9900') return {code:'9900', kana:'ﾕｳﾁﾖ', name:'ゆうちょ銀行'};
  if (d === '0005' || d === '5') return {code:'0005', kana:'ﾐﾂﾋﾞｼﾕ-ｴﾌｼﾞｴｲ', name:'三菱ＵＦＪ銀行'};
  if (d === '1533' || String(raw).indexOf('東濃信用金庫') >= 0) return {code:'1533', kana:'ﾄｳﾉｳｼﾝｷﾝ', name:'東濃信用金庫'};
  return {code:pad_(d, 4), kana:'', name:/[^0-9]/.test(raw) ? raw : ''};
}

function employeeWarnings_(bank, branch, account, kana) {
  const w = [];
  if (!clean_(bank)) w.push('銀行情報なし');
  if (!clean_(branch) && String(bank).indexOf('東濃信用金庫') < 0) w.push('支店情報なし');
  if (!account) w.push('口座番号なし');
  if (!clean_(kana)) w.push('よみなし');
  return w;
}

function exportCsv(token, rows) {
  verifyToken_(token);
  if (!Array.isArray(rows) || !rows.length) throw new Error('出力する従業員を選択してください');
  const normalized = rows.map(normalizeRow_);
  const errors = [];
  normalized.forEach(function(r, i) {
    [['金融機関コード',r[0],/^\d{4}$/],['支店コード',r[3],/^\d{3}$/],['預金種目',r[6],/^[1-4]$/],['口座番号',r[7],/^\d{7}$/],['従業員カナ名',r[8],/^.+$/],['従業員漢字名',r[9],/^.+$/],['従業員コード1',r[10],/^.+$/],['入力方式',r[12],/^[01]$/]].forEach(function(v) {
      if (!v[2].test(v[1])) errors.push((i + 1) + '行目 ' + v[0]);
    });
  });
  if (errors.length) throw new Error('入力内容を確認してください：' + errors.slice(0, 8).join('、'));
  const csv = [CSV_HEADERS].concat(normalized).map(function(row) { return row.map(csvCell_).join(','); }).join('\r\n') + '\r\n';
  const bytes = Utilities.newBlob('').setDataFromString(csv, 'Shift_JIS').getBytes();
  return {success:true, base64:Utilities.base64Encode(bytes), fileName:'ゆうちょBIZ新規登録用従業員マスタ_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm') + '.csv', count:normalized.length};
}

function normalizeRow_(r) {
  return [pad_(digits_(r.bankCode),4),halfKana_(r.bankKana),clean_(r.bankName),pad_(digits_(r.branchCode),3),halfKana_(r.branchKana),clean_(r.branchName),digits_(r.depositType)||'1',pad_(digits_(r.accountNumber),7),halfKana_(r.employeeKana),clean_(r.employeeName),clean_(r.employeeCode1),clean_(r.employeeCode2),digits_(r.inputMethod)||'0'];
}
function csvCell_(v) { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function clean_(v) { return String(v == null ? '' : v).replace(/[\u3000]/g, ' ').trim(); }
function digits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function pad_(v, n) { v = String(v || ''); return v ? ('0000000000' + v).slice(-n) : ''; }
function yuuchoBranch_(symbol) { const s = digits_(symbol); return s.length >= 4 ? s.slice(1, 4) : ''; }
function halfKana_(value) {
  let s = clean_(value).replace(/\s+/g, '');
  s = s.replace(/[ぁ-ゖ]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  const map = {'ガ':'ｶﾞ','ギ':'ｷﾞ','グ':'ｸﾞ','ゲ':'ｹﾞ','ゴ':'ｺﾞ','ザ':'ｻﾞ','ジ':'ｼﾞ','ズ':'ｽﾞ','ゼ':'ｾﾞ','ゾ':'ｿﾞ','ダ':'ﾀﾞ','ヂ':'ﾁﾞ','ヅ':'ﾂﾞ','デ':'ﾃﾞ','ド':'ﾄﾞ','バ':'ﾊﾞ','ビ':'ﾋﾞ','ブ':'ﾌﾞ','ベ':'ﾍﾞ','ボ':'ﾎﾞ','パ':'ﾊﾟ','ピ':'ﾋﾟ','プ':'ﾌﾟ','ペ':'ﾍﾟ','ポ':'ﾎﾟ','ヴ':'ｳﾞ','ア':'ｱ','イ':'ｲ','ウ':'ｳ','エ':'ｴ','オ':'ｵ','カ':'ｶ','キ':'ｷ','ク':'ｸ','ケ':'ｹ','コ':'ｺ','サ':'ｻ','シ':'ｼ','ス':'ｽ','セ':'ｾ','ソ':'ｿ','タ':'ﾀ','チ':'ﾁ','ツ':'ﾂ','テ':'ﾃ','ト':'ﾄ','ナ':'ﾅ','ニ':'ﾆ','ヌ':'ﾇ','ネ':'ﾈ','ノ':'ﾉ','ハ':'ﾊ','ヒ':'ﾋ','フ':'ﾌ','ヘ':'ﾍ','ホ':'ﾎ','マ':'ﾏ','ミ':'ﾐ','ム':'ﾑ','メ':'ﾒ','モ':'ﾓ','ヤ':'ﾔ','ユ':'ﾕ','ヨ':'ﾖ','ラ':'ﾗ','リ':'ﾘ','ル':'ﾙ','レ':'ﾚ','ロ':'ﾛ','ワ':'ﾜ','ヲ':'ｦ','ン':'ﾝ','ァ':'ｧ','ィ':'ｨ','ゥ':'ｩ','ェ':'ｪ','ォ':'ｫ','ッ':'ｯ','ャ':'ｬ','ュ':'ｭ','ョ':'ｮ','ー':'ｰ','・':'･'};
  return s.replace(/[ガ-ヴァ-ンー・]/g, function(c) { return map[c] || c; });
}

const APP_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ゆうちょBIZ新規登録用従業員マスタ</title><style>
:root{--navy:#17324d;--blue:#2878c7;--line:#d5e2ee;--bg:#f4f8fb;--red:#b42318;--green:#147d4d}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;background:var(--bg);color:#183247}header{background:linear-gradient(135deg,#17324d,#2878c7);color:#fff;padding:22px}.wrap{width:min(1200px,calc(100% - 24px));margin:auto}.title{display:flex;gap:13px;align-items:center}.icon{width:52px;height:52px;border-radius:15px;background:#fff;color:#2878c7;display:grid;place-items:center;font-size:28px}h1{margin:0;font-size:clamp(21px,4vw,31px)}.sub{margin:6px 0 0;opacity:.9}.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:16px;box-shadow:0 6px 22px rgba(23,50,77,.07)}.hidden{display:none!important}.login{width:min(420px,100%);margin:45px auto}.login label{display:block;font-weight:800;margin:13px 0 6px}input,select{border:1px solid #b7c9d9;border-radius:9px;padding:9px 10px;font:inherit;background:#fff}input:focus,select:focus{outline:3px solid #bfe1ff;border-color:#2878c7}.login input{width:100%}.btn{border:0;border-radius:10px;padding:10px 15px;background:#e8eef4;color:#17324d;font-weight:800;cursor:pointer}.primary{background:#2878c7;color:#fff}.login .primary{width:100%;margin-top:18px}.toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.toolbar input{min-width:230px;flex:1}.count{font-weight:800;color:#486581}.notice{padding:10px 12px;border-radius:9px;background:#eef7ff;color:#24557f;margin:10px 0}.error{background:#fff1f0;color:var(--red)}.ok{background:#ecf9f1;color:var(--green)}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;margin-top:12px}table{border-collapse:collapse;width:100%;min-width:1420px}th{position:sticky;top:0;background:#eaf3fa;color:#294c69;font-size:12px;text-align:left;padding:8px;border-bottom:1px solid var(--line);z-index:1}td{padding:6px 8px;border-bottom:1px solid #edf2f6;vertical-align:middle}td input,td select{width:100%;min-width:88px;padding:7px}.name{min-width:110px;font-weight:800}.code{font-family:ui-monospace,monospace}.warn{font-size:11px;color:var(--red);margin-top:3px}.selected{background:#f2f9ff}.actions{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}.help{font-size:13px;line-height:1.7;color:#5d7488}@media(max-width:650px){header{padding:17px 8px}.card{padding:13px}.toolbar>*{width:100%}.toolbar input{min-width:0}.actions .btn{width:100%}}
</style></head><body><header><div class="wrap title"><div class="icon">🏦</div><div><h1>ゆうちょBIZ新規登録用従業員マスタ</h1><p class="sub">講師マスターから新規登録用CSVを作成</p></div></div></header><main class="wrap"><section id="loginPanel" class="card login"><h2>スタッフログイン</h2><p class="help">講師番号とスタッフ用アプリのパスワードを入力してください。</p><label>講師番号</label><input id="code" autocomplete="username"><label>パスワード</label><input id="password" type="password" autocomplete="current-password"><button class="btn primary" onclick="staffLogin()">ログイン</button><div id="loginMsg"></div></section><section id="appPanel" class="hidden"><div class="card"><div class="toolbar"><input id="search" type="search" placeholder="講師コード・氏名・よみで検索" oninput="render()"><button class="btn" onclick="selectVisible(true)">表示中を全選択</button><button class="btn" onclick="selectVisible(false)">表示中を全解除</button><button class="btn" onclick="staffLogout()">ログアウト</button><span id="count" class="count"></span></div><div id="msg"></div><div class="table-wrap"><table><thead><tr><th>選択</th><th>コード</th><th>氏名</th><th>金融機関コード</th><th>金融機関カナ名</th><th>金融機関漢字名</th><th>支店コード</th><th>支店カナ名</th><th>支店漢字名</th><th>種目</th><th>口座番号</th><th>従業員カナ名</th><th>入力方式</th></tr></thead><tbody id="tbody"></tbody></table></div><div class="actions"><p class="help">必要な従業員だけにチェックを入れ、不足している銀行・支店情報を補ってください。CSVは添付見本と同じ13列・Shift_JISで出力します。</p><button class="btn primary" onclick="downloadCsv()">選択した従業員のCSVを出力</button></div></div></section></main><script>
let token='',rows=[];function call(name,args){return new Promise((resolve,reject)=>{google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e.message||e)))[name].apply(null,args||[]);});}async function staffLogin(){setMsg('loginMsg','確認しています…','notice');try{const r=await call('loginEmployeeMaster',[code.value,password.value]);token=r.token;localStorage.setItem('yuuchoEmployeeToken',token);loginPanel.classList.add('hidden');appPanel.classList.remove('hidden');await load();}catch(e){setMsg('loginMsg',e.message,'notice error');}}async function staffLogout(){const current=token;token='';rows=[];localStorage.removeItem('yuuchoEmployeeToken');appPanel.classList.add('hidden');loginPanel.classList.remove('hidden');password.value='';setMsg('loginMsg','ログアウトしました。','notice ok');try{await call('logoutEmployeeMaster',[current]);}catch(e){}}async function load(){setMsg('msg','講師マスターを読み込んでいます…','notice');try{rows=await call('getEmployees',[token]);rows.forEach(r=>r.selected=false);render();setMsg('msg','講師マスターを読み込みました。新規登録する従業員を選択してください。','notice ok');}catch(e){localStorage.removeItem('yuuchoEmployeeToken');token='';loginPanel.classList.remove('hidden');appPanel.classList.add('hidden');setMsg('loginMsg',e.message,'notice error');}}function render(){const q=(search.value||'').replace(/\s/g,'').toLowerCase();const visible=rows.filter(r=>(r.code+r.name+r.kana).replace(/\s/g,'').toLowerCase().includes(q));count.textContent='表示 '+visible.length+'名 / 選択 '+rows.filter(r=>r.selected).length+'名';tbody.innerHTML=visible.map(r=>{const i=rows.indexOf(r);return '<tr class="'+(r.selected?'selected':'')+'"><td><input type="checkbox" '+(r.selected?'checked':'')+' onchange="rows['+i+'].selected=this.checked;render()"></td><td class="code">'+esc(r.code)+'</td><td class="name">'+esc(r.name)+(r.warnings.length?'<div class="warn">'+esc(r.warnings.join('・'))+'</div>':'')+'</td>'+field(i,'bankCode')+field(i,'bankKana')+field(i,'bankName')+field(i,'branchCode')+field(i,'branchKana')+field(i,'branchName')+selectField(i,'depositType',[['1','普通'],['2','当座'],['4','貯蓄']])+field(i,'accountNumber')+field(i,'kana')+selectField(i,'inputMethod',[['0','通常'],['1','ゆうちょ']])+'</tr>';}).join('');}function field(i,k){return '<td><input value="'+attr(rows[i][k]||'')+'" oninput="rows['+i+'].'+k+'=this.value"></td>';}function selectField(i,k,opts){return '<td><select onchange="rows['+i+'].'+k+'=this.value">'+opts.map(o=>'<option value="'+o[0]+'" '+(String(rows[i][k])===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select></td>';}function selectVisible(v){const q=(search.value||'').replace(/\s/g,'').toLowerCase();rows.forEach(r=>{if((r.code+r.name+r.kana).replace(/\s/g,'').toLowerCase().includes(q))r.selected=v;});render();}async function downloadCsv(){const selected=rows.filter(r=>r.selected).map(r=>({bankCode:r.bankCode,bankKana:r.bankKana,bankName:r.bankName,branchCode:r.branchCode,branchKana:r.branchKana,branchName:r.branchName,depositType:r.depositType,accountNumber:r.accountNumber,employeeKana:r.kana,employeeName:r.name,employeeCode1:r.code,employeeCode2:'',inputMethod:r.inputMethod}));setMsg('msg','CSVを作成しています…','notice');try{const r=await call('exportCsv',[token,selected]);const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=r.fileName;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);setMsg('msg',r.count+'名分のCSVを出力しました。','notice ok');}catch(e){setMsg('msg',e.message,'notice error');}}function setMsg(id,t,c){const e=document.getElementById(id);e.className=c||'';e.textContent=t||'';}function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}function attr(s){return esc(s).replace(/'/g,'&#39;');}window.addEventListener('load',async()=>{const saved=localStorage.getItem('yuuchoEmployeeToken');if(saved){token=saved;loginPanel.classList.add('hidden');appPanel.classList.remove('hidden');await load();}});
const downloadCsvWithoutUploadNotice=downloadCsv;
downloadCsv=async function(){
  if(!confirm('ゆうちょBIZへの登録時は「全銀ファイル」ではなく「CSVファイル」を選択してアップロードしてください。\\n\\nCSVファイルをダウンロードしますか？'))return;
  await downloadCsvWithoutUploadNotice();
};
</script></body></html>`;

