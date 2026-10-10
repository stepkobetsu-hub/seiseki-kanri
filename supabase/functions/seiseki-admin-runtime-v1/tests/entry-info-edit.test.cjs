const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
let strip;try{const ts=require('typescript');strip=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}catch{strip=require('node:module').stripTypeScriptTypes;}
const root=path.join(__dirname,'..'),c={crypto:require('node:crypto').webcrypto};vm.createContext(c);
vm.runInContext(strip(fs.readFileSync(path.join(root,'entry-info-edit.ts'),'utf8').replace(/export /g,'')),c);
const values={club:'陸上',nickname:'',commuteMethod:'自転車',currentLessons:'なし',pastLessons:'',familyRequest:'希望',notes:'訂正',family:[{name:'家族',relation:'母',job:'会社員',workplace:'会社',grade:''}]};
c.values=values;c.original={studentId:'1321',imageUrl1:'original-image',signatureName:'guardian',ocrMemo:'AI_JSON:'+JSON.stringify({entryInfo:{club:'古い値',other:'preserved'},scores:[{jpn:72}],reports:[{rp_jpn:3}],guardian1:{name:'master'},family:[]})};
const merged=vm.runInContext('mergeEntryEdit(original,cleanEntryEdit(values))',c),ai=JSON.parse(merged.ocrMemo.split('AI_JSON:')[1]);
assert.equal(ai.entryInfo.club,'陸上');assert.equal(ai.entryInfo.other,'preserved');assert.equal(ai.scores[0].jpn,72);assert.equal(ai.reports[0].rp_jpn,3);assert.equal(ai.guardian1.name,'master');assert.equal(merged.imageUrl1,'original-image');assert.equal(merged.signatureName,'guardian');
assert.throws(()=>vm.runInContext('cleanEntryEdit({...values,club:123})',c));assert.throws(()=>vm.runInContext('cleanEntryEdit({...values,family:Array(31).fill({})})',c));
const main=fs.readFileSync(path.join(root,'index.ts'),'utf8');c.ResponseError=class extends Error{constructor(status,code,msg){super(msg);this.status=status;this.code=code;}};
c.query=(p,args)=>p+'?'+new URLSearchParams(args);const writes=[];
c.pg=async(p,init)=>{writes.push({p,init});return []};c.entryInfoState=async()=>({studentUuid:'uuid',code:'1321',sourceVersion:'source',revision:'revision',data:c.original});
vm.runInContext(strip(main.slice(main.indexOf('async function saveEntryInfo('),main.indexOf('async function importMissingEntryGrades(')),{mode:'transform'})+';this.save=saveEntryInfo',c);
(async()=>{
 await assert.rejects(()=>c.save({studentId:'1321',sourceVersion:'wrong',revision:'revision',values}),e=>e.status===409);assert.equal(writes.length,0);
 await assert.rejects(()=>c.save({studentId:'1321',sourceVersion:'source',revision:'old',values}),e=>e.status===409);assert.equal(writes.length,0);
 await assert.rejects(()=>c.save({studentId:'1321',sourceVersion:'source',revision:'revision',values}),e=>e.status===409);assert.equal(writes.length,1);assert.equal(writes[0].init.method,'PATCH');assert(writes[0].p.includes('revision=eq.revision'));
 writes.length=0;c.entryInfoState=async()=>({studentUuid:'uuid',code:'1321',sourceVersion:'source',revision:'',data:c.original});
 await assert.rejects(()=>c.save({studentId:'1321',sourceVersion:'source',values}),e=>e.status===409);assert.equal(writes[0].init.headers.Prefer,'resolution=ignore-duplicates,return=representation');
 assert(main.includes("['saveStudentDirectory','saveEntrySheetInfo'].includes(action) && level !== '4'"));
 console.log('PASS: entry edits preserve grades/master/images, validate inputs and reject stale or concurrent writes; level 4 restriction present');
})().catch(e=>{console.error(e);process.exitCode=1});
