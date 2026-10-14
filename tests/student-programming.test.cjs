const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('admin.html','utf8');
function fixture(){
 const fields={stuSearch:{value:''},stuCampus:{value:''}};
 const context=vm.createContext({document:{getElementById:id=>fields[id]||null,querySelectorAll:()=>[]},students:[
  {id:'1',grade:'小1',campus:'神領',course:'プロ',active:true},
  {id:'2',grade:'中2',campus:'大手',course:'プロ（QU）',active:true},
  {id:'3',grade:'高3',campus:'神領',course:'プロ（RO）',active:true},
  {id:'4',grade:'小1',campus:'神領',course:'小学1科',active:true},
  {id:'5',grade:'中1',campus:'神領',course:'プロ',active:false}
 ],_stuSchoolExclude:new Set(),_stuSortGrade:false,_stuSortSchool:'',onStudentFilterChange(){},normalizeGrade:g=>g,
 enrollmentSelection:()=>({showActive:true,showWithdrawn:false}),matchesStudentListEnrollment:s=>s.active,matchesUnifiedStudentSearch_:(s,q)=>s.id===q});
 vm.runInContext(html.slice(html.indexOf('const STU_GRADE_GROUPS ='),html.indexOf('function studentFilterParams()')),context);
 vm.runInContext(html.slice(html.indexOf('function _getFilteredSortedStudents()'),html.indexOf('function filterStudents()')),context);
 return {context,fields,run:code=>vm.runInContext(code,context)};
}
test('programming includes all ages, replaces grade selection, and respects campus/enrollment',()=>{
 const {run,fields}=fixture();
 run("toggleStuGrade('小1'); toggleStuProgramming()");
 assert.equal(run("_getFilteredSortedStudents().map(s=>s.id).join(',')"),'1,2,3');
 assert.equal(run('selectedStuGrades().length'),0);
 fields.stuCampus.value='大手';
 assert.equal(run("_getFilteredSortedStudents().map(s=>s.id).join(',')"),'2');
 fields.stuCampus.value='';
 run("toggleStuGrade('小1')");
 assert.equal(run("_getFilteredSortedStudents().map(s=>s.id).join(',')"),'1,4');
 run("toggleStuProgramming(); toggleStuProgramming()");
 assert.equal(run('_getFilteredSortedStudents().length'),4);
});
test('course matching accepts fullwidth parentheses but excludes unrelated courses',()=>{
 const {run}=fixture();
 for(const course of ['プロ','プロ（QU）','プロ（RO）','プロ(QU)',' プロ （RO） '])assert.equal(run(`isProgrammingStudent({course:${JSON.stringify(course)}})`),true);
 for(const course of ['',null,'小学1科','プロではない'])assert.equal(run(`isProgrammingStudent({course:${JSON.stringify(course)}})`),false);
});
