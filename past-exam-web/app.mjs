import {normalizeSchools,restoreSchools} from './school-catalog.mjs?v=1.0.2';
import {ExamApi,cellKey} from './registration.mjs?v=1.0.1-fetch2';
const $=id=>document.getElementById(id),api=new ExamApi(window.PAST_EXAM_UPLOAD_CONFIG);
const schoolKey='stepPastExamWebSchoolsV1';
const pendingKey='stepPastExamWebPastExamPendingV1';
let schools=[],ready=false,busy=false,pending=null;
const getStorage=k=>{try{return localStorage.getItem(k);}catch{return null;}};
try{pending=JSON.parse(getStorage(pendingKey)||'null');if(pending){cellKey(pending.ctx);if(!pending.file?.fileId)pending=null;}}catch{pending=null;}
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function paintPending(){
  $('pending').hidden=!pending;
  if(pending){$('pendingDescription').textContent=`${pending.ctx.schoolName} / ${pending.ctx.year} / ${pending.ctx.grade} / ${pending.ctx.subject} / 第${pending.ctx.exam}回\n${pending.file.name}`;}
  $('submit').disabled=!ready||busy||!!pending;$('pdf').disabled=!!pending;
}
function lock(value){busy=value;$('fields').disabled=value;$('reload').disabled=value;$('retry').disabled=value;paintPending();}
function exams(){
  const count=Number(schools.find(s=>String(s.id)===$('school').value)?.examCount)||0;
  $('exam').replaceChildren(new Option('選択',''),...Array.from({length:count},(_,i)=>new Option(`第${i+1}回`,String(i+1))));name();
}
function context(){return {schoolId:$('school').value,schoolName:schools.find(s=>String(s.id)===$('school').value)?.name||'',teacher:$('teacher').value.trim(),grade:$('grade').value,subject:$('subject').value,year:$('year').value,exam:$('exam').value,kind:$('kind').value};}
function name(){
  const c=context(),parts=[c.teacher,c.schoolName,c.grade,c.subject,c.year,c.exam?`第${c.exam}回`:'',c.kind];
  const value=parts.every(Boolean)?parts.map(s=>s.replace(/[\\/:*?"<>|\s]/g,'')).join('_')+'.pdf':'';
  $('fileName').textContent=value||'項目を選ぶと表示されます';return value;
}
function showSchools(loaded){
  const selected=$('school').value,exam=$('exam').value;
  schools=loaded;$('school').replaceChildren(new Option('選択',''),...schools.map(s=>new Option(s.name,s.id)));
  if(schools.some(s=>s.id===selected))$('school').value=selected;
  exams();if([...$('exam').options].some(o=>o.value===exam))$('exam').value=exam;
  name();ready=true;
}
async function loadSchools(){
  if(busy)return;lock(true);$('schoolStatus').textContent='学校一覧を更新中…';
  try{
    const data=await api.load(),loaded=normalizeSchools(data.schools);
    let saved=true;try{localStorage.setItem(schoolKey,JSON.stringify(loaded));}catch{saved=false;}
    showSchools(loaded);$('schoolStatus').textContent=`学校一覧を更新しました（${schools.length}校）。`+(saved?'次回もこの一覧を使います。':'端末には保存できませんでした。');status('');
  }catch(e){$('schoolStatus').textContent='更新できませんでした。保存済みの学校一覧で続けられます。';status(e.message,true);}
  finally{lock(false);}
}
function base64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('PDFを読み込めませんでした'));r.onload=()=>resolve(String(r.result).split(',')[1].replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));r.readAsDataURL(file);});}
function showFile(file){$('savedFile').replaceChildren();try{const u=new URL(file.url);if(u.protocol!=='https:'||u.hostname!=='drive.google.com')return;const a=document.createElement('a');a.href=u.href;a.textContent=file.name;a.target='_blank';a.rel='noopener';$('savedFile').append(a);}catch{}}
async function register(){
  status('PDFは保存済みです。過去問DBへ登録し、反映を確認しています…');
  const saved=pending;await api.register(saved);
  localStorage.removeItem(pendingKey);pending=null;paintPending();showFile(saved.file);
  $('pdf').value='';$('fileStatus').textContent='登録したPDFは上のリンクから確認できます。';
  status('過去問DBへの登録を確認しました。');$('complete').hidden=false;$('complete').scrollIntoView({behavior:'smooth',block:'start'});
  if(typeof $('done').showModal==='function')$('done').showModal();
}
$('form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||pending||!ready)return;
  const file=$('pdf').files[0],ctx=context(),fileName=name();if(!ctx.teacher||!file||!fileName)return;
  lock(true);$('complete').hidden=true;$('savedFile').replaceChildren();
  try{
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')throw Error('スキャンしたPDFを選択してください。');
    if(file.size===0)throw Error('PDFが空です。ファイルを選び直してください。');
    const signature=await file.slice(0,5).text();if(signature!=='%PDF-')throw Error('PDF形式を確認できません。書類をPDFで保存して選び直してください。');
    localStorage.setItem('stepPastExamWebStorageCheck','1');localStorage.removeItem('stepPastExamWebStorageCheck');
    localStorage.setItem('stepPastExamWebPastExamTeacher',ctx.teacher);
    status('PDFを保存中です。画面を閉じずにお待ちください…');
    const saved=await api.upload(file,await base64(file),fileName);
    pending={ctx,file:saved,createdAt:Date.now()};
    localStorage.setItem(pendingKey,JSON.stringify(pending));paintPending();showFile(saved);
    await register();
  }catch(e){status((pending?'PDFは保存済みです。再アップロードは不要です。\n':'')+(e.name==='AbortError'?'通信の応答を確認できませんでした。時間をおいて再試行してください。':e.message),true);}
  finally{lock(false);}
});
$('retry').addEventListener('click',async()=>{if(busy||!pending)return;lock(true);$('complete').hidden=true;try{await register();}catch(e){status('PDFは保存済みです。\n'+e.message,true);}finally{lock(false);}});
$('reload').addEventListener('click',loadSchools);$('school').addEventListener('change',exams);
$('form').addEventListener('change',name);$('teacher').addEventListener('input',name);
$('pdf').addEventListener('change',()=>{$('fileStatus').textContent=$('pdf').files[0]?.name||'PDFを選択してください。';$('complete').hidden=true;});
$('closeDone').addEventListener('click',()=>$('done').close());
const year=new Date().getFullYear()-(new Date().getMonth()<3?1:0);
$('year').replaceChildren(new Option('選択',''),...Array.from({length:year-1999},(_,i)=>new Option(`${year-i}年度`,String(year-i))));$('year').value=String(year);
$('teacher').value=getStorage('stepPastExamWebPastExamTeacher')||'';
if(navigator.standalone||matchMedia('(display-mode: standalone)').matches)$('install').hidden=true;
// Startup never depends on the network; only an explicit refresh loads the server.
let schoolStorage;try{schoolStorage=localStorage;}catch{schoolStorage={getItem:()=>null};}
showSchools(restoreSchools(schoolStorage,schoolKey));
$('schoolStatus').textContent=`保存済みの学校一覧（${schools.length}校）。学校が変わったときだけ更新してください。`;
paintPending();
