
const headers = {'Access-Control-Allow-Origin':'https://stepkobetsu-hub.github.io','Access-Control-Allow-Headers':'content-type,authorization,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers});
const root = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rest(path: string, init: RequestInit={}) {
 const response = await fetch(root+'/rest/v1/'+path,{...init,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...init.headers}});
 if(!response.ok) throw new Error('Database request failed');
 return response.json();
}
async function roleFor(pass: string) {
 if(!pass) return 'view';
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pass));
 const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const roles=await rest('past_exam_auth?digest=eq.'+digest+'&select=role');
 return roles[0]?.role || '';
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(!['GET','POST'].includes(req.method))return reply({ok:false,error:'Method not allowed'},405);
 try {
  let p:Record<string,any>=Object.fromEntries(new URL(req.url).searchParams);
  if(req.method==='POST') {
   if((req.headers.get('content-type')||'').includes('application/json'))p={...p,...await req.json()};
   else p={...p,...Object.fromEntries(new URLSearchParams(await req.text()))};
  }
  const action=p.action||'load';
  const role=await roleFor(String(p.pass||''));
  if(!role)return reply({ok:false,error:'パスワードが違います'},401);
  if(action==='load'||action==='getSchools') {
   const rows=await rest('past_exam_state?id=eq.true&select=payload,revision,updated_at');
   if(!rows[0])throw new Error('Not initialized');
   const s=rows[0];
   if(action==='getSchools')return reply({ok:true,schools:s.payload.schools});
   const data=s.payload;
   if(role!=='admin')data.deletedFiles=[];
   return reply({ok:true,data,revision:s.revision,updatedAt:s.updated_at,isAdmin:role==='admin',isUser:role==='admin'||role==='user',isView:role==='view',backend:'supabase'});
  }
  if(req.method!=='POST'||role==='view')return reply({ok:false,error:'権限がありません'},403);
  let payload=typeof p.payload==='string'?JSON.parse(p.payload):p.payload;
  const mode=action==='saveFull'?'full':action==='savePatch'?'patch':action==='saveRow'?'upsert':'';
  if(!mode)return reply({ok:false,error:'不明なアクション'},400);
  if(mode==='full'&&(!payload||!Array.isArray(payload.schools)||!payload.db||Array.isArray(payload.db)||typeof payload.db!=='object'))return reply({ok:false,error:'invalid payload'},400);
  if(mode==='patch'&&(!Array.isArray(payload)||payload.length>2000||payload.some(o=>!o||typeof o.key!=='string'||!Object.hasOwn(o,'before')||!Object.hasOwn(o,'after'))))return reply({ok:false,error:'invalid patch'},400);
  if(mode==='upsert'&&(!payload||typeof payload.key!=='string'||!Object.hasOwn(payload,'value')))return reply({ok:false,error:'invalid row'},400);
  if(mode==='patch'&&payload.some(o=>['__schools__','__deleted__'].includes(o.key))&&role!=='admin')return reply({ok:false,error:'管理者権限が必要です'},403);
  const revision=p.revision===undefined?null:Number(p.revision);
  if(revision!==null&&(!Number.isSafeInteger(revision)||revision<1))return reply({ok:false,error:'invalid revision'},400);
  const result=await rest('rpc/past_exam_mutate',{method:'POST',body:JSON.stringify({p_mode:mode,p_payload:payload,p_revision:revision})});
  return reply(result,result.conflict?409:200);
 } catch(e) {
  console.error('past-exam-runtime',e instanceof Error?e.message:'request failed');
  return reply({ok:false,error:'保存・読み込みに失敗しました。再試行してください。'},500);
 }
});
