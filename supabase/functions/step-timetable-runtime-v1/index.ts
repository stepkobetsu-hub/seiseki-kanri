import {today,dayPlus,validate,baseLessons,parseHistory} from './core.mjs';
const cors={'Access-Control-Allow-Origin':'https://stepkobetsu-hub.github.io','Access-Control-Allow-Headers':'content-type,authorization','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const ROOT=Deno.env.get('SUPABASE_URL')!;
async function pg(path:string,method='GET',body?:unknown,prefer='return=representation'){
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const r=await fetch(ROOT+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await r.text();if(!r.ok)throw Error(raw.includes('REVISION_CONFLICT')?'ほかの人が変更しました。再読込してから変更してください。':'データ処理に失敗しました ('+r.status+')');return raw?JSON.parse(raw):null;
}
async function auth(token:string){
 if(!token||token.length>400)throw Error('AUTH_REQUIRED');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
 const rows=await pg('seiseki_admin_sessions?token_hash=eq.'+hash+'&select=staff_code,permission_level,expires_at&limit=1');
 if(!rows[0]||Date.parse(rows[0].expires_at)<=Date.now()||!['1','2','3','4'].includes(rows[0].permission_level))throw Error('AUTH_REQUIRED');return rows[0];
}
async function syncTokkun(){
 const [response,students]=await Promise.all([fetch('https://script.google.com/macros/s/AKfycbxIH2VtgwRi50xduXgrkYrjD0yrzNfQ5vCWt1XgOzil6LZSgXNj6MJo9jPYvOkjNHdu/exec?action=getHistory&limit=100',{signal:AbortSignal.timeout(45000)}),pg('students?select=student_code,name,grade,campus&enrollment_status=in.(active,withdrawal_scheduled)&limit=1000')]);
 const items=await response.json();if(!Array.isArray(items))throw Error('送信履歴を取得できませんでした');let added=0;
 for(const h of items)for(const e of parseHistory(h,students)){const r=await pg('rpc/step_timetable_event','POST',{p_event:e.key,p_campus:e.campus,p_day:e.day,p_lesson:e.lesson});if(r)added++;}
 return {success:true,added};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return new Response('{}',{status:405,headers:cors});
 try{
 const p=await req.json();
 if(p.action==='scheduledSync'){const s=await pg('step_timetable_service?select=token&limit=1');if(!p.serviceToken||p.serviceToken!==s[0]?.token)throw Error('AUTH_REQUIRED');return new Response(JSON.stringify(await syncTokkun()),{headers:cors});}
 const user=await auth(String(p.token||''));let out:unknown;
 const campus=p.campus;if(!['神領','大手'].includes(campus))throw Error('校舎を選択してください');
 if(p.action==='bootstrap'){
  const [days,students,state]=await Promise.all([pg('step_timetable_days?campus=eq.'+encodeURIComponent(campus)+'&day=gte.'+today()+'&day=lte.'+dayPlus(today(),34)+'&order=day.asc'),pg('students?select=student_code,name,grade,campus&enrollment_status=in.(active,withdrawal_scheduled)&limit=1000'),pg('student_directory_sync_state?select=last_success_at&limit=1')]);out={success:true,days,students,masterUpdatedAt:state[0]?.last_success_at,permission:user.permission_level};
 }else if(p.action==='generate'){
  if(![2,3,4,5].includes(Number(p.weeks)))throw Error('2～5週間を選択してください');
  const state=await pg('student_directory_sync_state?select=last_success_at&limit=1');if(!state[0]?.last_success_at||Date.now()-Date.parse(state[0].last_success_at)>30*60000)throw Error('マスタ同期が30分以上前です。「マスタを更新」を押してから作成してください。');
  const [details,rules]=await Promise.all([pg('student_directory_details?select=student_code,detail&limit=1000'),pg('step_timetable_rules?select=*&limit=1000')]);
  const rows=[];for(let i=0;i<Number(p.weeks)*7;i++){const day=dayPlus(today(),i);rows.push({campus,day,updated_by:user.staff_code,data:{lessons:baseLessons(details,rules,campus,day),studentMessage:'',teacherMessage:''}});}
  out={success:true,created:await pg('rpc/step_timetable_generate','POST',{p_days:rows})};
 }else if(p.action==='save'){
  if(!Array.isArray(p.days)||p.days.length<1||p.days.length>2)throw Error('日付が不正です');
  for(const d of p.days){if(d.campus!==campus||!/^20\d{2}-\d{2}-\d{2}$/.test(d.day)||d.day<today()||d.day>dayPlus(today(),365))throw Error('日付が不正です');validate(d.data);}
  out={success:true,days:await pg('rpc/step_timetable_save','POST',{p_days:p.days,p_staff:user.staff_code})};
 }else if(p.action==='rules'){out={success:true,rules:await pg('step_timetable_rules?campus=eq.'+encodeURIComponent(campus)+'&select=*&order=weekday,position&limit=1000')};
 }else if(p.action==='saveRule'){
  const r=p.rule;if(!r||r.campus!==campus||!Number.isInteger(r.weekday)||r.weekday<0||r.weekday>6||!r.student_name||!r.subject||String(r.teacher).length>80||String(r.group_key).length>80)throw Error('基本配置が不正です');out={success:true,rules:await pg('step_timetable_rules?on_conflict=campus,weekday,student_name,subject','POST',r,'resolution=merge-duplicates,return=representation')};
 }else if(p.action==='syncTokkun'){out=await syncTokkun();}else throw Error('未対応の操作です');
 return new Response(JSON.stringify(out),{headers:cors});
 }catch(e){const message=String(e.message||e);return new Response(JSON.stringify({success:false,error:message}),{status:message==='AUTH_REQUIRED'?401:400,headers:cors});}
});
