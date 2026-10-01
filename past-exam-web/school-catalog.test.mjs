import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {bundledSchools,restoreSchools,normalizeSchools} from './school-catalog.mjs';
test('first launch and blocked or corrupt storage use the verified bundled master',()=>{
 for(const storage of [{getItem:()=>null},{getItem:()=>'{broken'},{getItem:()=>{throw Error('blocked');}},{getItem:()=>JSON.stringify([])}])assert.deepEqual(restoreSchools(storage,'key'),bundledSchools);
 assert.equal(bundledSchools.length,7);
 assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../android-past-exam-scanner/app/src/main/assets/schools.json',import.meta.url))),bundledSchools);
});
test('a saved annual revision takes precedence and only master fields are retained',()=>{
 const revised=[{id:'s8',name:'追加中学校',examCount:4,db:{shouldNotBeCached:true}}];
 assert.deepEqual(restoreSchools({getItem:()=>JSON.stringify(revised)},'key'),[{id:'s8',name:'追加中学校',examCount:4}]);
});
test('invalid server master cannot replace the saved list',()=>{
 for(const bad of [[],[{id:'',name:'学校',examCount:5}],[{id:'s1',name:'学校',examCount:0}],[{id:'s1',name:'学校',examCount:5},{id:'s1',name:'別の学校',examCount:5}]])assert.throws(()=>normalizeSchools(bad));
});
