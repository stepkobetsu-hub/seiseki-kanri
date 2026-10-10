const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
let strip;try{const ts=require('typescript');strip=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}catch{strip=require('node:module').stripTypeScriptTypes;}
const root=__dirname,html=fs.readFileSync(path.join(root,'student_directory.html'),'utf8');
let resolveDb;const db=new Promise(r=>resolveDb=r),node={disabled:false,classList:{add(){},remove(){}},replaceChildren(){},querySelectorAll(){return[]}};
const c={AbortController,setTimeout,clearTimeout,listRequest:0,request:0,token:()=> 'fixture',resetDetails(){},document:{querySelector:()=>node},el:()=>node,readCachedIndex:()=>[],prepareSearch:x=>x,saveCachedIndex(){},setStatus(){},renderCandidates(){},StepStaffAuth:{fetchRuntime:()=>db},api:async()=>({success:true,students:[{id:'1332',name:'New master name',kana:'Kana'}]})};vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('let masterIndexRequest=0;'),html.indexOf('function renderCandidates()'))+';this.load=loadList;',c);
(async()=>{
 await c.load();assert.equal(c.students[0].name,'New master name');resolveDb({ok:true,json:async()=>({success:true,students:[{id:'1332',name:'Old DB name'}]})});await c.admissionIndexPromise;assert.equal(c.students[0].name,'New master name');
 const main=fs.readFileSync(path.join(root,'supabase/functions/seiseki-admin-runtime-v1/index.ts'),'utf8'),writes=[];
 const b={query:(p)=>p,pg:async(p,init)=>{writes.push({p,body:JSON.parse(init.body)})},EdgeRuntime:{waitUntil(){}},importMissingAdmissionDates:async()=>{}};vm.createContext(b);
 vm.runInContext(strip(main.slice(main.indexOf('async function putDirectoryDetails('),main.indexOf('async function syncDirectory(')),{mode:'transform'})+';this.put=putDirectoryDetails;',b);
 const snapshot={success:true,student:{id:'1332',name:'New master name',kana:'Kana',grade:'小4',campus:'神領',school:'学校',flag:'1',loginPassword:'must-not-copy'},editable:{E:{value:'New master name'}}};
 await b.put([snapshot],'2026-10-10T11:00:00Z');assert.equal(writes[0].p,'students');assert.equal(writes[0].body[0].name,'New master name');assert.equal(writes[0].body[0].active,true);assert.equal(writes[0].body[0].enrollment_status,'active');assert(!('id'in writes[0].body[0]));assert(!('admission_date'in writes[0].body[0]));assert(!('loginPassword'in writes[0].body[0]));assert.equal(writes[1].p,'student_directory_details');
 writes.length=0;await assert.rejects(()=>b.put([{...snapshot,success:false}],'2026-10-10T11:00:00Z'));assert.equal(writes.length,0);
 console.log('PASS: delayed old DB list cannot replace master list; verified snapshot synchronizes search metadata without changing identity/admissions/passwords/grades');
})().catch(e=>{console.error(e);process.exitCode=1});
