import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import * as files from '../supabase/functions/seiseki-admin-runtime-v1/meeting-files.mjs';
import {permissionTarget,checkPermissionBridge} from '../supabase/functions/seiseki-admin-runtime-v1/permission-bridge.ts';
const mid='test-memo', aid='a9fed91a-a9fd-4265-9b16-7a65bc36fa64';
function setup(){
 const tables={students:[{student_code:'123',name:'テスト',campus:'神領'}],meeting_memos:[],meeting_memo_files:[],seiseki_admin_sessions:[],seiseki_admin_mirror_queue:[],step_permission_bridge_config:[]},objects=new Map();
 async function pg(path,opt={}){
  const u=new URL('https://test/'+path),table=u.pathname.slice(1);tables[table]??=[];const rows=tables[table];
  const matches=r=>[...u.searchParams].every(([k,v])=>['select','limit','order','on_conflict'].includes(k)||v.startsWith('eq.')?['select','limit','order','on_conflict'].includes(k)||String(r[k])===v.slice(3):v.startsWith('in.(')?v.slice(4,-1).split(',').includes(String(r[k])):true);
  if(opt.method==='POST'){const value=JSON.parse(opt.body);const old=rows.find(r=>r[u.searchParams.get('on_conflict')||'id']===value[u.searchParams.get('on_conflict')||'id']);if(old){if(!String(opt.headers?.Prefer).includes('ignore-duplicates'))Object.assign(old,value);return [structuredClone(old)];}rows.push({...value});return [structuredClone(value)];}
  const selected=rows.filter(matches);
  if(opt.method==='PATCH')for(const row of selected)Object.assign(row,JSON.parse(opt.body));
  if(opt.method==='DELETE')tables[table]=rows.filter(r=>!matches(r));
  return structuredClone(selected);
 }
 const storage=async(mode,path,bytes,mime)=>{if(mode==='upload'){objects.set(path,{bytes,mime});return null;}assert(objects.has(path));return 'https://wisedgcgwaebtkprdhth.supabase.co/storage/v1/object/sign/'+path+'?token=test';};
 return {tables,objects,pg,storage};
}
const payload={id:mid,studentId:'123',attachmentId:aid,name:'学校のテスト.pdf',base64:btoa('%PDF-1.7\nテスト'.replace('テスト','test'))};
test('upload retry, readback, removal, cross-student and cross-memo protection',async()=>{
 const d=setup();const r=await files.uploadMeetingFile(payload,d);await files.uploadMeetingFile(payload,d);assert.equal(d.objects.size,1);assert.equal(r.attachment.name,payload.name);assert(!('object_path' in r.attachment));
 await assert.rejects(files.openMeetingFile(payload,d),e=>e.meetingFileStatus===404);
 const attachments=await files.resolveMeetingFiles([aid],null,mid,'123',d);assert.equal(attachments.length,1);
 d.tables.meeting_memos.push({id:mid,student_code:'123',attachments});assert((await files.openMeetingFile(payload,d)).url.includes('?token='));
 assert.deepEqual(await files.resolveMeetingFiles(undefined,d.tables.meeting_memos[0],mid,'123',d),attachments);
 await assert.rejects(files.resolveMeetingFiles([aid],null,'other','123',d));await assert.rejects(files.resolveMeetingFiles([aid],null,mid,'999',d));await assert.rejects(files.resolveMeetingFiles([aid,aid],null,mid,'123',d));
 d.tables.meeting_memos[0].attachments=[];await assert.rejects(files.openMeetingFile(payload,d),e=>e.meetingFileStatus===404);
 await assert.rejects(files.uploadMeetingFile({...payload,base64:btoa('%PDF-different')},d),e=>e.meetingFileStatus===409);
});
test('invalid content, size, unknown student and filename sanitization',async()=>{
 const d=setup();await assert.rejects(files.uploadMeetingFile({...payload,studentId:'999'},d));
 await assert.rejects(files.uploadMeetingFile({...payload,base64:btoa('<script>alert(1)</script>')},d),e=>e.meetingFileStatus===400);
 await assert.rejects(files.uploadMeetingFile({...payload,base64:'x'.repeat(Math.ceil(files.MAX_SIZE/3)*4+1)},d),e=>e.meetingFileStatus===413);
 const r=await files.uploadMeetingFile({...payload,name:'../../test\u0000.pdf'},d);assert.equal(r.attachment.name,'.._.._test_.pdf');
});
test('real runtime requires auth, routes attachments through meeting permissions and preserves attachments for legacy editors',async()=>{
 const d=setup();let handler;
 const token='seiseki-grade:test';const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 d.tables.seiseki_admin_sessions.push({token_hash:hash,staff_code:'test',permission_level:'1',expires_at:'2100-01-01',verified_at:new Date().toISOString()});
 const context=vm.createContext({console,Error,URL,Request,Response,TextEncoder,crypto,Uint8Array,atob,...files,checkPermissionBridge,preflightResponse:()=>null,CORS_HEADERS:{},Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://test.supabase.co':'test-only'},serve:fn=>handler=fn},EdgeRuntime:{waitUntil:()=>{}},fetch:async(url,opts={})=>{
  if(url.includes('/rest/v1/'))return Response.json(await d.pg(url.split('/rest/v1/')[1],opts));
  if(url.includes('/storage/v1/')){if(url.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/private?token=test'});return Response.json({});}
  return Response.json({success:false});
 }});
 const source=fs.readFileSync(new URL('../supabase/functions/seiseki-admin-runtime-v1/index.ts',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');
 vm.runInContext(stripTypeScriptTypes(source,{mode:'transform'}),context);
 const call=async p=>{const response=await handler(new Request('https://test/runtime',{method:'POST',body:JSON.stringify(p)}));return {status:response.status,...await response.json()};};
 assert.equal((await call({...payload,action:'saveMeetingAttachment'})).status,401);
 assert.equal((await call({...payload,action:'saveMeetingAttachment',token})).status,400);
 assert.equal((await call({...payload,action:'saveMeetingAttachment',token,mutationId:aid})).success,true);
 const save={action:'saveMeetingMemo',id:mid,studentId:'123',date:'2026-11-03',staff:'テスト',content:'テスト本文',attachmentIds:[aid],token,mutationId:crypto.randomUUID()};
 assert.equal((await call(save)).memo.attachments[0].id,aid);
 assert.equal((await call({action:'getMeetingMemos',studentId:'123',token})).memos[0].attachments[0].id,aid);
 assert.equal((await call({action:'getMeetingAttachment',id:mid,attachmentId:aid,token})).success,true);
 assert.equal((await call({...save,attachmentIds:undefined,content:'本文のみ変更'})).memo.attachments[0].id,aid);
 assert.equal((await call({...save,attachmentIds:[]})).memo.attachments.length,0);
 assert.equal((await call({action:'getMeetingAttachment',id:mid,attachmentId:aid,token})).status,404);
 assert.deepEqual(permissionTarget('saveMeetingAttachment','student-directory'),{appId:'public-13',mode:'write'});
 assert.deepEqual(permissionTarget('getMeetingAttachment','public-12'),{appId:'public-13',mode:'view'});
});

test('browser editor retries failed uploads and renders literal filenames below the memo',async()=>{
 class Element{constructor(tag){this.tag=tag;this.children=[];this.textContent='';}append(...a){this.children.push(...a);}replaceChildren(...a){this.children=[...a];}setAttribute(k,v){this[k]=v;}}
 class Reader{readAsDataURL(file){file.arrayBuffer().then(b=>{this.result='data:application/pdf;base64,'+Buffer.from(b).toString('base64');this.onload();});}}
 const win={},context={window:win,document:{createElement:t=>new Element(t)},crypto,FileReader:Reader};vm.runInNewContext(fs.readFileSync(new URL('../assets/js/meeting-files.js',import.meta.url),'utf8'),context);
 const host=new Element('div');let changed=0;const editor=win.StepMeetingFiles.editor(host,()=>changed++),input=host.children[0];
 input.files=[new File(['%PDF-test'],'<img src=x>.pdf',{type:'application/pdf'})];input.onchange();assert.equal(editor.ids().length,1);
 await assert.rejects(editor.upload(mid,'123',async()=>{throw Error('network');}));assert.equal(editor.ids().length,1);
 await editor.upload(mid,'123',async p=>({success:true,attachment:{id:p.attachmentId,name:p.name,mimeType:'application/pdf',size:9}}));assert.equal(editor.snapshot().files.length,1);assert(changed>=2);
 let uploads=0;await editor.upload(mid,'123',async()=>{uploads++;});assert.equal(uploads,0);
 await assert.rejects(editor.upload(mid,'999',async()=>{}),/生徒は変更/);
 const article=new Element('article');article.append(new Element('div'));win.StepMeetingFiles.render(article,{id:mid,attachments:editor.snapshot().files});assert.equal(article.children.length,2);assert.equal(article.children[1].children[0].textContent,'📄 <img src=x>.pdf');
 host.children[2].children[0].children[1].onclick();assert.equal(editor.ids().length,0);
 input.files=[new File(['%PDF-new'],'new.pdf')];input.onchange();await editor.upload('other','999',async p=>({success:true,attachment:{id:p.attachmentId}}));
});

test('image viewer fits rotated bounds, zooms, pans and closes without a new tab',async()=>{
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.events={};this.clientWidth=800;this.clientHeight=600;this.scrollWidth=800;this.scrollHeight=600;this.scrollLeft=0;this.scrollTop=0;}
  append(...a){this.children.push(...a);}setAttribute(k,v){this[k]=v;}addEventListener(k,fn){(this.events[k]??=[]).push(fn);}showModal(){this.open=true;}close(){this.open=false;for(const fn of this.events.close||[])fn();}remove(){this.removed=true;}setPointerCapture(){}
 }
 const body=new Element('body'),win={addEventListener(){},removeEventListener(){}},context={window:win,document:{body,createElement:t=>new Element(t)}};
 vm.runInNewContext(fs.readFileSync(new URL('../assets/js/meeting-files.js',import.meta.url),'utf8'),context);
 const host=new Element('div');win.StepMeetingFiles.render(host,{id:mid,attachments:[{id:aid,name:'学校の結果.jpg',mimeType:'image/jpeg'}]},async()=>({success:true,url:'https://wisedgcgwaebtkprdhth.supabase.co/storage/v1/object/sign/private?token=test'}));
 await host.children[0].children[0].onclick();const dialog=body.children[0],toolbar=dialog.children[1],stage=dialog.children[2],status=dialog.children[3].children[0],paper=stage.children[0].children[0],img=paper.children[0];
 assert(dialog.open);assert(toolbar.children[0].disabled);img.naturalWidth=1200;img.naturalHeight=1600;img.onload();assert.match(status.textContent,/36%.*0°/);
 toolbar.children[1].onclick();assert.match(status.textContent,/47%.*90°/);assert.match(img.style.transform,/rotate\(90deg\)/);assert.equal(Number.parseFloat(paper.style.height),568);
 toolbar.children[5].onclick();assert.equal(paper.style.width,'1600px');assert.match(status.textContent,/100%/);
 toolbar.children[2].onclick();assert.match(status.textContent,/80%/);
 stage.events.pointerdown[0]({pointerId:1,clientX:100,clientY:100,preventDefault(){}});stage.events.pointermove[0]({pointerId:1,clientX:70,clientY:80});assert.equal(stage.scrollLeft,30);assert.equal(stage.scrollTop,20);
 toolbar.children[0].onclick();assert.match(img.style.transform,/rotate\(0deg\)/);toolbar.children[4].onclick();assert.match(status.textContent,/36%/);
 dialog.children[0].children[1].onclick();assert(dialog.removed);assert.equal(dialog.open,false);
});
