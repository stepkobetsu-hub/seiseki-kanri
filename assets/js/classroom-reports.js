(function(){
'use strict';
const endpoint='https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/step-publicity-report-runtime-v1';
const $=id=>document.getElementById(id);let mode='',actor=null,items=[],editing=null,saving=false,hasMore=false,pending=null,idleTimer=null;const deleteMutations=new Map();let attachments=[],draftId=crypto.randomUUID();
const idleKey='meetingMemoLastActivityAt',idleMs=30*60*1000;
function store(){return mode==='shared'?sessionStorage:localStorage;}
function token(){return store().getItem('adminSystemPortalSessionToken')||'';}
function textNode(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
async function call(payload){
 const c=new AbortController();const timer=setTimeout(()=>c.abort(),45000);
 try{const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({...payload,token:token()}),signal:c.signal,cache:'no-store'});const v=await res.json();if(!res.ok||v.success!==true){const e=new Error(v.error||'接続できませんでした。');e.status=res.status;throw e;}return v;}
 catch(e){if(e.name==='AbortError')throw new Error('通信がタイムアウトしました。入力は残っています。もう一度送信してください。');throw e;}finally{clearTimeout(timer);}
}
function chooseDevice(value){mode=value;document.querySelectorAll('[data-device]').forEach(b=>b.classList.toggle('active',b.dataset.device===mode));}
function touch(){if(mode!=='shared'||!actor)return;sessionStorage.setItem(idleKey,String(Date.now()));clearTimeout(idleTimer);idleTimer=setTimeout(()=>logout(true),idleMs);}
function gate(message){clearTimeout(idleTimer);$('app').hidden=true;$('loginGate').hidden=false;$('logoutButton').hidden=true;$('loginError').textContent=message||'';}
function reset(){for(const a of attachments)if(a.previewUrl)URL.revokeObjectURL(a.previewUrl);attachments=[];draftId=crypto.randomUUID();$('attachmentStatus').textContent='';renderAttachments();editing=null;pending=null;$('reportForm').reset();$('formTitle').textContent='報告内容を入力';$('sendButton').textContent='送信';$('cancelButton').hidden=true;}
async function start(){
 const result=await call({action:'list',offset:0});
 if(actor&&actor.code!==result.actor.code)reset();actor=result.actor;items=result.reports;hasMore=result.hasMore;
 $('staffLabel').textContent=(store().getItem('adminStaffName')||actor.code)+'（'+actor.code+'）';
 $('scopeLabel').textContent=actor.level===4?'全員の報告を表示しています。':'自分が報告した内容を表示しています。';
 $('loginGate').hidden=true;$('app').hidden=false;$('logoutButton').hidden=false;$('loginPassword').value='';render();touch();
}
async function login(e){
 e.preventDefault();if(!mode){$('loginError').textContent='この端末の種類を選択してください。';return;}
 $('loginButton').disabled=true;$('loginError').textContent='';
 try{
  const code=$('loginCode').value.trim();const staff=await StepStaffAuth.login(code,$('loginPassword').value);const session=staff.gradeSessionToken||staff.systemPortalSessionToken;
  if(!session)throw new Error('ログイン情報を確認できませんでした。');
  const otherStore=mode==='shared'?localStorage:sessionStorage;
  for(const key of ['adminSystemPortalSessionToken','adminSystemPortalExpiresAt','adminStaffCode','adminStaffName','adminLoggedIn','adminDeviceMode','meetingDeviceMode',idleKey])otherStore.removeItem(key);
  store().setItem('adminSystemPortalSessionToken',session);store().setItem('adminStaffCode',String(staff.code||code));store().setItem('adminStaffName',String(staff.name||''));store().setItem('adminLoggedIn','1');
  if(mode==='shared'){sessionStorage.setItem('meetingDeviceMode','shared');sessionStorage.setItem('adminDeviceMode','school');sessionStorage.setItem(idleKey,String(Date.now()));}
  else{sessionStorage.removeItem('meetingDeviceMode');sessionStorage.removeItem('adminSystemPortalSessionToken');await StepStaffAuth.persist(session);}
  await start();
 }catch(e){$('loginError').textContent=e.message;}finally{$('loginButton').disabled=false;}
}
async function logout(automatic=false){
 const current=token();actor=null;items=[];deleteMutations.clear();reset();$('history').replaceChildren();$('staffLabel').textContent='';$('saveStatus').textContent='';$('loginPassword').value='';
 for(const s of [localStorage,sessionStorage])for(const k of ['adminSystemPortalSessionToken','adminSystemPortalExpiresAt','adminStaffCode','adminStaffName','adminLoggedIn','adminDeviceMode','meetingDeviceMode',idleKey,'adminCodeInput','adminPwInput'])s.removeItem(k);
 gate(automatic?'共用端末を30分使用していなかったためログアウトしました。':'');
 if(current)try{await Promise.race([StepStaffAuth.logout(current),new Promise(r=>setTimeout(r,3000))]);}catch{}
 chooseDevice('');
}
function date(value,full=false){if(!value)return '';const d=new Date(value.length===10?value+'T00:00:00+09:00':value);return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',weekday:'short',...(full?{hour:'2-digit',minute:'2-digit'}:{})}).format(d);}
function render(){
 $('history').replaceChildren();$('moreButton').hidden=!hasMore;
 if(!items.length){$('history').append(textNode('p','まだ報告はありません。','note'));return;}
 for(const r of items){
  const box=textNode('article','','report'),top=textNode('div','','report-top');top.append(textNode('h3',r.title));
  const actions=textNode('div','','report-actions');
  const b=textNode('button','編集');b.type='button';b.disabled=saving;b.addEventListener('click',()=>edit(r));
  const remove=textNode('button','削除','delete-report');remove.type='button';remove.disabled=saving;remove.setAttribute('aria-label',r.title+'を削除');remove.addEventListener('click',()=>deleteReport(r));
  actions.append(b,remove);top.append(actions);box.append(top);
  const meta=textNode('div','','report-meta');meta.append(textNode('span',r.campus,'pill'),textNode('span',r.category,'pill'),document.createTextNode('報告者：'+(r.author_name||r.author_code)+'（'+r.author_code+'）'));
  meta.append(document.createElement('br'),document.createTextNode('送信：'+date(r.created_at,true)+(r.revision>1?' ／ 更新：'+date(r.updated_at,true):'')));
  if(r.event_date)meta.append(document.createElement('br'),document.createTextNode('出来事・予定：'+date(r.event_date)));
  box.append(meta,textNode('div',r.body,'report-body'));
  if(r.attachments?.length){const files=textNode('div','','report-files');for(const a of r.attachments){const b=textNode('button',(a.mimeType==='application/pdf'?'PDF：':'写真：')+a.name);b.type='button';b.addEventListener('click',()=>openAttachment(r.id,a));files.append(b);}box.append(files);}
  $('history').append(box);
 }
}
function edit(r){if(saving)return;editing={id:r.id,revision:r.revision};pending=null;for(const a of attachments)if(a.previewUrl)URL.revokeObjectURL(a.previewUrl);attachments=(r.attachments||[]).map(a=>({...a,uploaded:true}));renderAttachments();$('campus').value=r.campus;$('category').value=r.category;$('eventDate').value=r.event_date||'';$('title').value=r.title;$('body').value=r.body;$('formTitle').textContent='報告内容を編集';$('sendButton').textContent='変更して送信';$('cancelButton').hidden=false;$('saveStatus').textContent='';$('formCard').scrollIntoView({behavior:'smooth',block:'start'});$('title').focus();}
async function deleteReport(r){
 if(saving||!confirm('「'+r.title+'」を削除しますか？\n削除すると元に戻せません。'))return;
 const session=token();
 const key=r.id+':'+r.revision;if(!deleteMutations.has(key))deleteMutations.set(key,crypto.randomUUID());
 saving=true;for(const field of $('reportForm').elements)field.disabled=true;render();$('historyStatus').textContent='削除しています…';
 try{
  await call({action:'delete',id:r.id,revision:r.revision,mutationId:deleteMutations.get(key)});
  if(!actor||token()!==session)return;
  deleteMutations.delete(key);items=items.filter(item=>item.id!==r.id);if(editing?.id===r.id)reset();
  $('saveStatus').className='status success';$('saveStatus').textContent='削除しました。STEP広報窓口にも削除を反映します。';await refresh();
 }catch(e){if(actor&&token()===session){$('historyStatus').textContent=e.message;if(e.status===401)gate(e.message);}}
 finally{saving=false;for(const field of $('reportForm').elements)field.disabled=false;render();}
}
async function refresh(more=false){
 $('refreshButton').disabled=true;$('moreButton').disabled=true;$('historyStatus').textContent='';
 try{const result=await call({action:'list',offset:more?items.length:0});items=more?[...items,...result.reports]:result.reports;hasMore=result.hasMore;render();}
 catch(e){$('historyStatus').textContent=e.message;if(e.status===401)gate(e.message);}
 finally{$('refreshButton').disabled=false;$('moreButton').disabled=false;}
}
async function save(e){
 e.preventDefault();if(saving)return;
 const value={action:'save',id:editing?.id||draftId,revision:editing?.revision||0,campus:$('campus').value,category:$('category').value,eventDate:$('eventDate').value,title:$('title').value.trim(),body:$('body').value.trim(),attachmentIds:attachments.map(a=>a.id),authorName:store().getItem('adminStaffName')||''};
 if(!value.title||!value.body){$('saveStatus').textContent='件名と内容を入力してください。';$('saveStatus').className='status error';return;}
 const fingerprint=JSON.stringify(value);
 if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,id:value.id||crypto.randomUUID(),mutationId:crypto.randomUUID()};
 const session=token();saving=true;for(const field of $('reportForm').elements)field.disabled=true;renderAttachments();$('saveStatus').className='status';$('saveStatus').textContent='送信しています…';
 try{for(let i=0;i<attachments.length;i++){const a=attachments[i];if(a.file&&!a.uploaded){$('saveStatus').textContent='添付を保存しています（'+(i+1)+'/'+attachments.length+'）…';await uploadFile(a,value.id,value.campus);if(!actor||token()!==session)return;}}
 $('saveStatus').textContent='報告を送信しています…';await call({...value,id:pending.id,mutationId:pending.mutationId});if(!actor||token()!==session)return;reset();$('saveStatus').className='status success';$('saveStatus').textContent='送信しました。STEP広報窓口のお知らせと話題に反映されます。';await refresh();}
 catch(e){if(actor&&token()===session){$('saveStatus').className='status error';$('saveStatus').textContent=e.message;if(e.status===401)gate(e.message);}}
 finally{saving=false;for(const field of $('reportForm').elements)field.disabled=false;renderAttachments();}
}
function renderAttachments(){
 $('attachmentList').replaceChildren();
 for(const a of attachments){const box=textNode('div','','attachment-item');if(a.previewUrl){const img=document.createElement('img');img.src=a.previewUrl;img.alt=a.name;box.append(img);}box.append(textNode('span',a.name+'（'+(a.size/1024/1024).toFixed(1)+'MB）','attachment-name'));const b=textNode('button','取り外す');b.type='button';b.disabled=saving;b.addEventListener('click',()=>{if(saving)return;if(a.previewUrl)URL.revokeObjectURL(a.previewUrl);attachments=attachments.filter(x=>x.id!==a.id);pending=null;renderAttachments();});box.append(b);$('attachmentList').append(box);}
}
function selectFiles(){
 const input=$('attachmentsInput'),files=[...input.files];$('attachmentStatus').textContent='';
 if(attachments.length+files.length>5){$('attachmentStatus').textContent='添付は５点までです。';input.value='';return;}
 for(const f of files){if(!f.size||f.size>10*1024*1024){$('attachmentStatus').textContent='１ファイル10MBまでです。';input.value='';return;}if(!['image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif','application/pdf'].includes(f.type)&&!/\.(jpe?g|png|gif|webp|heic|heif|pdf)$/i.test(f.name)){ $('attachmentStatus').textContent='写真またはPDFを選択してください。';input.value='';return;}}
 for(const file of files)attachments.push({id:crypto.randomUUID(),name:file.name,mimeType:file.type,size:file.size,file,uploaded:false,previewUrl:['image/jpeg','image/png','image/gif','image/webp'].includes(file.type)?URL.createObjectURL(file):null});
 pending=null;input.value='';renderAttachments();
}
async function uploadFile(a,id,campus){
 const form=new FormData();form.append('token',token());form.append('reportId',id);form.append('attachmentId',a.id);form.append('campus',campus);form.append('file',a.file);
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),120000);
 try{const res=await fetch(endpoint,{method:'POST',body:form,signal:c.signal,cache:'no-store'}),v=await res.json();if(!res.ok||!v.success){const e=new Error(v.error||'添付を保存できませんでした。');e.status=res.status;throw e;}Object.assign(a,v.attachment,{uploaded:true});}
 catch(e){if(e.name==='AbortError')throw new Error('添付の保存に時間がかかりました。選んだファイルを残しています。もう一度送信してください。');throw e;}finally{clearTimeout(timer);}
}
async function openAttachment(id,a){
 const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
 try{const v=await call({action:'attachmentUrl',id,attachmentId:a.id});if(popup)popup.location.href=v.url;else{const link=document.createElement('a');link.href=v.url;link.target='_blank';link.rel='noopener noreferrer';link.click();}}
 catch(e){if(popup)popup.close();$('historyStatus').textContent=e.message;if(e.status===401)gate(e.message);}
}
$('attachmentsInput').addEventListener('change',selectFiles);
$('loginForm').addEventListener('submit',login);$('reportForm').addEventListener('submit',save);$('cancelButton').addEventListener('click',()=>{reset();$('saveStatus').textContent='';});
$('refreshButton').addEventListener('click',()=>refresh());$('moreButton').addEventListener('click',()=>refresh(true));$('logoutButton').addEventListener('click',()=>logout());
document.querySelectorAll('[data-device]').forEach(b=>b.addEventListener('click',()=>chooseDevice(b.dataset.device)));
for(const name of ['pointerdown','keydown','input'])document.addEventListener(name,touch,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&mode==='shared'&&actor&&Date.now()-Number(sessionStorage.getItem(idleKey)||0)>=idleMs)void logout(true);});
mode=sessionStorage.getItem('meetingDeviceMode')==='shared'&&sessionStorage.getItem('adminSystemPortalSessionToken')?'shared':localStorage.getItem('adminSystemPortalSessionToken')?'personal':sessionStorage.getItem('adminSystemPortalSessionToken')?'shared':'';
if(mode==='shared'&&Date.now()-Number(sessionStorage.getItem(idleKey)||Date.now())>=idleMs){void logout(true);}
else if(token())start().catch(e=>gate(e.message));else gate('');
})();

