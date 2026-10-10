type Row=Record<string,unknown>;
const fields=['jpn','soc','math','sci','eng','mus','art','pe','tech'];
const columns=['japanese','social','math','science','english','music','art','health_pe','technology_home'];
const digits=(v:unknown)=>String(v??'').normalize('NFKC').trim();
const gradeNo=(v:unknown)=>Number(digits(v).match(/[1-6]/)?.[0]||0);
function integer(v:unknown,min:number,max:number):number|null{const s=digits(v);if(!/^\d+$/.test(s))return null;const n=Number(s);return Number.isInteger(n)&&n>=min&&n<=max?n:null;}
export function entryGradeRows(ai:Row,student:Row,academicYear:number):{scores:Row[];reports:Row[];warnings:string[]}{
 const warnings:string[]=[],scores:Row[]=[],reports:Row[]=[];
 for(const [kind,list] of [['scores',scores],['reports',reports]] as const){
  const source=Array.isArray(ai[kind])?ai[kind] as Row[]:[];
  const seen=new Set<string>();
  for(const raw of source){
   if(!raw||typeof raw!=='object')continue;
   const rp=kind==='reports',keys=fields.map(f=>rp?'rp_'+f:f);
   if(!keys.some(k=>raw[k]!=null&&digits(raw[k])!==''))continue;
   const paper=gradeNo(raw.grade||raw.schoolGrade||raw.rowGrade),current=gradeNo(student.grade);
   const explicitYear=digits(raw.year);
   const year=explicitYear?integer(explicitYear,2000,academicYear):paper&&current?academicYear-current+paper:null;
   const round=rp?digits(raw.semester||raw.term):digits(raw.term||raw.testNo||raw.round);
   const term=integer(round.replace(/学期$/,''),1,rp?3:10);
   if(!year||!term){warnings.push((rp?'通知表':'テスト')+'：年度・回次／学期を特定できない行は追加しませんでした。');continue;}
   if(paper&&current&&year!==academicYear-current+paper){warnings.push('紙の学年と年度が一致しない行は追加しませんでした。');continue;}
   const key=year+':'+term;if(seen.has(key)){warnings.push('同じ年度・回次／学期が重複する行は追加しませんでした。');continue;}seen.add(key);
   const row:Row={student_id:student.id,school_year:year,[rp?'term':'test_number']:rp?term+'学期':term};
   let valid=true;
   keys.forEach((k,i)=>{const blank=raw[k]==null||digits(raw[k])==='';const n=blank?null:integer(raw[k],rp?1:0,rp?5:100);if(!blank&&n===null)valid=false;row[columns[i]]=n;});
   if(!valid){warnings.push((rp?'通知表':'テスト')+'：範囲外の値を含む行は追加しませんでした。');continue;}
   if(!rp){
    for(const [k,col,max] of [['total5','total_5',500],['total9','total_9',900],['rank5','rank_5',10000],['rank9','rank_9',10000]] as const){
     const blank=raw[k]==null||digits(raw[k])==='';const n=blank?null:integer(raw[k],0,max);if(!blank&&n===null)valid=false;row[col]=n;
    }
    if(!valid){warnings.push('合計・順位が不正な行は追加しませんでした。');continue;}
    const five=columns.slice(0,5).map(c=>row[c] as number|null),nine=columns.map(c=>row[c] as number|null);
    if(row.total_5===null&&five.every(v=>v!==null))row.total_5=five.reduce((a,b)=>Number(a)+Number(b),0);
    if(row.total_9===null&&nine.every(v=>v!==null))row.total_9=nine.reduce((a,b)=>Number(a)+Number(b),0);
   }
   list.push(row);
  }
 }
 return {scores,reports,warnings};
}
// Database inserts must use ignore-duplicates: existing rows are never patched.
export function missingEntryRows(rows:Row[],db:Row[],legacy:Row[],report:boolean):Row[]{
 const key=(r:Row)=>Number(r.school_year??r.year)+':'+(report?digits(r.term??r.semester).replace(/学期$/,''):Number(r.test_number??r.term));
 const existing=new Set([...db,...legacy].map(key));return rows.filter(r=>!existing.has(key(r)));
}
