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
async function setup(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const memory=new Map([['adminSystemPortalSessionToken','test-only']]);const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const state={confirm:false,calls:[],failDelete:false,deleted:false};
 const doc={getElementById:get,createElement:()=>new Element(),createTextNode:()=>new Element(),querySelectorAll:()=>[],addEventListener(){}};
 vm.runInNewContext(source,{document:doc,localStorage:storage,sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},crypto:webcrypto,Intl,Date,AbortController,setTimeout,clearTimeout,confirm:()=>state.confirm,fetch:async(_url,o)=>{
  const p=JSON.parse(o.body);state.calls.push(p);
  if(p.action==='delete'){if(state.failDelete)throw new Error('通信失敗');state.deleted=true;return{ok:true,json:async()=>({success:true,deletedId:p.id})};}
  return{ok:true,json:async()=>({success:true,actor:{code:'test-a',level:1},reports:state.deleted?[]:[report],hasMore:false})};
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
