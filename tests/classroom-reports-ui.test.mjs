import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../assets/js/classroom-reports.js',import.meta.url),'utf8');
const report={id:'e597c70f-bc79-436f-87ed-762b6652d07e',revision:1,title:'報告の動作検証',body:'内容',campus:'神領校',category:'行事予定',created_at:'2026-10-07T00:00:00Z',updated_at:'2026-10-07T00:00:00Z',author_code:'test-a',external_use:false};
class Element{
 constructor(){this.children=[];this.handlers={};this.dataset={};this.elements=[];this.value='';this.classList={toggle(){}};}
 append(...e){this.children.push(...e);}replaceChildren(...e){this.children=e;}setAttribute(k,v){this[k]=v;}addEventListener(n,f){this.handlers[n]=f;}reset(){this.resets=(this.resets||0)+1;}scrollIntoView(){}focus(){}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(level=1){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const memory=new Map([['adminSystemPortalSessionToken','test-only']]);const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const state={confirm:false,calls:[],failDelete:false,failUpload:false,deleted:false};
 const doc={getElementById:get,createElement:()=>new Element(),createTextNode:()=>new Element(),querySelectorAll:()=>[],addEventListener(){}};
 vm.runInNewContext(source,{document:doc,localStorage:storage,sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},crypto:webcrypto,Intl,Date,AbortController,URL,FormData,setTimeout,clearTimeout,confirm:()=>state.confirm,fetch:async(_url,o)=>{
  if(o.body instanceof FormData){const p={action:'upload',id:o.body.get('reportId'),attachmentId:o.body.get('attachmentId')};state.calls.push(p);if(state.failUpload)throw new Error('添付失敗');const file=o.body.get('file');return{ok:true,json:async()=>({success:true,attachment:{id:p.attachmentId,name:file.name,mimeType:file.type,size:file.size}})};}
  const p=JSON.parse(o.body);state.calls.push(p);
  if(p.action==='delete'){if(state.failDelete)throw new Error('通信失敗');state.deleted=true;return{ok:true,json:async()=>({success:true,deletedId:p.id})};}
  return{ok:true,json:async()=>({success:true,actor:{code:'test-a',level},reports:state.deleted?[]:[report],hasMore:false})};
 }});
 await tick();await tick();const remove=()=>get('history').children[0].children[0].children[1].children[1];
 return{state,get,remove};
}
test('canceling confirmation sends no delete request',async()=>{
 const {state,remove,get}=await setup();await remove().handlers.click();assert.equal(state.calls.filter(p=>p.action==='delete').length,0);assert.equal(get('history').children.length,1);assert.equal(remove().textContent,'削除');
});
test('failed delete keeps report and retry uses same mutation; success refreshes without report',async()=>{
 const {state,remove,get}=await setup();state.confirm=true;state.failDelete=true;await remove().handlers.click();await tick();assert.equal(get('history').children[0].className,'report');assert.equal(get('historyStatus').textContent,'通信失敗');
 state.failDelete=false;await remove().handlers.click();await tick();const deletes=state.calls.filter(p=>p.action==='delete');assert.equal(deletes.length,2);assert.equal(deletes[0].mutationId,deletes[1].mutationId);assert.equal(deletes[0].revision,1);assert.equal(get('history').children[0].textContent,'まだ報告はありません。');assert(get('saveStatus').textContent.includes('削除しました'));
});


test('failed attachment upload keeps selection; retry sends report once without consent checkbox',async()=>{
 const {state,get}=await setup();get('title').value='写真の報告';get('body').value='教室の様子';get('attachmentsInput').files=[new File(['%PDF-1.7\nexample'],'予定.pdf',{type:'application/pdf'})];get('attachmentsInput').handlers.change();assert.equal(get('attachmentList').children.length,1);
 state.failUpload=true;await get('reportForm').handlers.submit({preventDefault(){}});assert.equal(state.calls.filter(p=>p.action==='save').length,0);assert.equal(get('attachmentList').children.length,1);
 state.failUpload=false;await get('reportForm').handlers.submit({preventDefault(){}});const uploads=state.calls.filter(p=>p.action==='upload'),saved=state.calls.filter(p=>p.action==='save');assert.equal(uploads.length,2);assert.equal(uploads[0].attachmentId,uploads[1].attachmentId);assert.equal(saved.length,1);assert.equal(saved[0].attachmentIds[0],uploads[0].attachmentId);assert.equal(saved[0].id,uploads[0].id);assert.equal(saved[0].externalUse,undefined);assert.equal(get('attachmentList').children.length,0);
});

test('AI forwarding link is offered only to desk-capable staff and contains only a report ID',async()=>{
 const staff=await setup(1);assert.equal(staff.get('history').children[0].children[0].children[1].children.length,2);
 const manager=await setup(4),link=manager.get('history').children[0].children[0].children[1].children[2];assert.equal(link.textContent,'AIへ転送');const url=new URL(link.href);assert.equal(url.origin,'https://step-publicity-desk.mintcocoajasmine.chatgpt.site');assert.equal(url.searchParams.get('forwardReportId'),report.id);assert.equal([...url.searchParams.keys()].length,1);assert(!link.href.includes('test-only'));
});
