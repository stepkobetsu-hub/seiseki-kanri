const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

let stripTypeScriptTypes;
try {
  const ts = require('typescript');
  stripTypeScriptTypes = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
} catch {
  stripTypeScriptTypes = require('node:module').stripTypeScriptTypes;
}

const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
function takeFunction(name) {
  const starts = [`function ${name}(`, `async function ${name}(`];
  const start = Math.min(...starts.map(token => source.indexOf(token)).filter(index => index >= 0));
  assert.ok(start >= 0, `missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const names = ['numberOrNull','requiredInt','boundedNumberOrNull','completeTotal','saveScore','saveReport'];
const code = stripTypeScriptTypes(names.map(takeFunction).join('\n'), {mode:'transform'}) + '\nthis.saveScore=saveScore;this.saveReport=saveReport;';
const writes = [];
const context = {
  ResponseError: class ResponseError extends Error { constructor(status, code, message) { super(message); this.status=status; this.code=code; } },
  studentUuid: async () => 'student-uuid',
  query: (table, args) => table + '?' + new URLSearchParams(args).toString(),
  pg: async (requestPath, init={}) => { writes.push({requestPath,init}); return [{id:'saved'}]; },
  mirror: async payload => ({success:true,payload}),
};
vm.createContext(context);
vm.runInContext(code, context);

(async () => {
  let result = await context.saveScore({studentId:'test',isNew:true,year:2024,term:2,jpn:80,soc:70,math:60,sci:50,eng:40,mus:5,art:6,pe:7,tech:8});
  let saved = JSON.parse(writes.pop().init.body);
  assert.equal(saved.total_5, 300);
  assert.equal(saved.total_9, 326);
  assert.equal(result.payload.total5, 300);

  await context.saveScore({studentId:'test',year:2025,term:3,originalYear:2024,originalTerm:2,jpn:90});
  assert.equal(writes.pop().init.method, 'PATCH');

  context.pg = async () => [];
  await assert.rejects(() => context.saveScore({studentId:'test',isNew:true,year:2024,term:2,jpn:80}), error => error.code === 'DUPLICATE_SCORE');
  await assert.rejects(() => context.saveScore({studentId:'test',isNew:true,year:2024,term:2,jpn:101}), error => error.code === 'INVALID_SCORE');
  await assert.rejects(() => context.saveScore({studentId:'test',isNew:true,year:2024,term:2}), error => error.code === 'EMPTY_SCORE');

  context.pg = async (requestPath, init={}) => { writes.push({requestPath,init}); return [{id:'saved'}]; };
  result = await context.saveReport({studentId:'test',isNew:true,year:2024,semester:'1学期',rp_jpn:5,rp_soc:4,rp_math:3,rp_sci:2,rp_eng:1,rp_mus:5,rp_art:4,rp_pe:3,rp_tech:2});
  saved = JSON.parse(writes.pop().init.body);
  assert.equal('total_5' in saved, false);
  assert.equal('total_9' in saved, false);
  assert.equal(result.payload.total5, 15);
  assert.equal(result.payload.total9, 29);

  await context.saveReport({studentId:'test',year:2025,semester:'2学期',originalYear:2024,originalSemester:'1学期',rp_jpn:4});
  const reportUpdate = writes.pop();
  assert.equal(reportUpdate.init.method, 'PATCH');
  assert.match(reportUpdate.requestPath, /school_year=eq\.2024/);
  assert.match(reportUpdate.requestPath, /term=eq\.1%E5%AD%A6%E6%9C%9F/, 'original report term is included in the update filter');

  context.pg = async () => [];
  await assert.rejects(() => context.saveReport({studentId:'test',isNew:true,year:2024,semester:'1学期',rp_jpn:5}), error => error.code === 'DUPLICATE_REPORT');
  await assert.rejects(() => context.saveReport({studentId:'test',isNew:true,year:2024,semester:'1学期',rp_jpn:6}), error => error.code === 'INVALID_REPORT');
  console.log('PASS: historical inserts, key changes, duplicate protection, ranges and calculated totals');
})().catch(error => { console.error(error); process.exitCode = 1; });

