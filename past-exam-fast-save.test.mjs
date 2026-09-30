import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source=fs.readFileSync(new URL('./past_exam_db.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function harness(fetch) {
  const zeroTimers=[];
  const elements=new Map();
  const element=()=>({style:{},className:'',textContent:'',addEventListener(){},classList:{add(){},remove(){}}});
  const context=vm.createContext({fetch,AbortController,URLSearchParams,Date,console,
    location:{search:''},window:{addEventListener(){}},
    document:{addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
    localStorage:{getItem(){return null;},setItem(){}},sessionStorage:{getItem(){return null;}},
    setTimeout(fn,ms){if(ms===0)zeroTimers.push(fn);return 1;},clearTimeout(){}});
  vm.runInContext(source,context);
  return {run:code=>vm.runInContext(code,context),zeroTimers,elements};
}

test('edits made during a save are committed in a second serialized request',async()=>{
  const calls=[];let release;
  const h=harness(async(url,options)=>{
    calls.push(JSON.parse(options.body));
    if(calls.length===1)await new Promise(resolve=>release=resolve);
    return {json:async()=>({ok:true})};
  });
  h.run("liveReady=true; schools=[{id:'s1'}]; db={a:{files:[]}}; persistedState=captureState(); db.a.noan=true;");
  const first=h.run('saveNow()');
  h.run('db.a.stu=true; saveNow();');
  assert.equal(calls.length,1);
  release();await first;
  assert.equal(h.zeroTimers.length,1);
  await h.zeroTimers.shift()();
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].payload,[{key:'a',before:{files:[]},after:{files:[],noan:true}}]);
  assert.deepEqual(calls[1].payload,[{key:'a',before:{files:[],noan:true},after:{files:[],noan:true,stu:true}}]);
});

test('a conflict keeps local changes and does not retry a full replacement',async()=>{
  const calls=[];
  const h=harness(async(url,options)=>{calls.push(options);return {json:async()=>({ok:false,conflict:true,error:'conflict'})};});
  h.run("liveReady=true; schools=[]; db={a:{files:[]}}; persistedState=captureState(); db.a.noan=true;");
  await h.run('saveNow()');
  assert.equal(calls.length,1);
  assert.equal(h.run('liveReady'),false);
  assert.equal(h.run('db.a.noan'),true);
  assert.equal(h.run('persistedState.db.a.noan'),undefined);
  assert.equal(h.zeroTimers.length,0);
});

test('network retry sends the identical patch through the legacy endpoint',async()=>{
  const calls=[];
  const h=harness(async(url,options)=>{calls.push({url,options});if(calls.length===1)throw Error('response lost');return {json:async()=>({ok:true})};});
  h.run("liveReady=true; schools=[]; db={a:{files:[]}}; persistedState=captureState(); db.a.noan=true;");
  await h.run('saveNow()');
  assert.equal(calls.length,2);
  const direct=JSON.parse(calls[0].options.body);
  const legacy=new URLSearchParams(calls[1].options.body);
  assert.equal(legacy.get('action'),'savePatch');
  assert.deepEqual(JSON.parse(legacy.get('payload')),direct.payload);
});
