import { reportAction, ReportError } from './report-core.mjs';
import { checkPermissionBridge } from './permission-bridge.ts';
const cors={'Access-Control-Allow-Origin':'https://stepkobetsu-hub.github.io','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function json(v:unknown,status=200){return Response.json(v,{status,headers:{...cors,'Cache-Control':'no-store'}});}
function env(name:string){const v=Deno.env.get(name);if(!v)throw new Error('Missing runtime configuration');return v;}
async function pg(path:string,options:RequestInit={}){
  const key=env('SUPABASE_SERVICE_ROLE_KEY');
  const r=await fetch(env('SUPABASE_URL')+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('Report storage unavailable');
  return r.status===204?[]:r.json();
}
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
async function verify(token:unknown){
  if(typeof token!=='string'||!token.trim()||token.length>2000)throw new ReportError(401,'ログインしてください。');
  const r=await fetch(env('SUPABASE_URL')+'/functions/v1/seiseki-admin-runtime-v1',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'verifyStaffSession',token,permissionAppId:'public-13'}),signal:AbortSignal.timeout(20000)});
  const v=await r.json();if(!r.ok||v.success!==true)throw new ReportError(r.status===403?403:r.status===503?503:401,v.error||'もう一度ログインしてください。');
  return {code:String(v.code||''),level:Number(v.permissionLevel)};
}
async function authorize(actor:{code:string;level:number},mode:string,campus:string|null,oldCampus?:string){
  const normalize=(c:string)=>c==='大手町校'?'大手町':c==='神領校'?'神領':'';
  const requested=campus?normalize(campus):'';
  const checks=[requested,...(oldCampus?[normalize(oldCampus)]:[])].filter(Boolean);
  const verdict=await checkPermissionBridge({staff_code:actor.code,permission_level:String(actor.level)},{action:mode==='write'?'saveMeetingMemo':'getMeetingMemos',campus:requested},pg,checks);
  if(verdict&&verdict.allowed!==true)throw new ReportError(403,String(verdict.reason||'この操作を行う権限がありません。'));
  const scope=String(verdict?.scope||'all');
  if(mode==='write'&&scope!=='all'&&(!requested||checks.some(c=>c!==scope)))throw new ReportError(403,'この校舎の報告を編集する権限がありません。');
  return scope==='神領'?'神領校':scope==='大手町'?'大手町校':'all';
}
async function verifyReader(key:unknown){
  if(typeof key!=='string'||!/^[0-9a-f]{64}$/.test(key))throw new ReportError(401,'Unauthorized');
  const rows=await pg('step_publicity_reader_config?select=key_hash,enabled&id=eq.step_desk&limit=1');
  if(!rows[0]?.enabled||await hash(key)!==rows[0].key_hash)throw new ReportError(401,'Unauthorized');
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json({success:false,error:'Method not allowed'},405);
  const origin=req.headers.get('origin');if(origin&&origin!=='https://stepkobetsu-hub.github.io')return json({success:false,error:'Forbidden'},403);
  try{
    const body=await req.text();if(body.length>14000)return json({success:false,error:'内容が長すぎます。'},413);
    const payload=JSON.parse(body);
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new ReportError(400,'入力内容を確認してください。');
    return json(await reportAction(payload,{pg,verify,authorize,verifyReader}));
  }catch(e){if(e instanceof ReportError)return json({success:false,error:e.message},e.status);if(e instanceof SyntaxError)return json({success:false,error:'入力内容を確認してください。'},400);console.error('Publicity report request failed');return json({success:false,error:'保存先に接続できませんでした。入力を残したまま、再度お試しください。'},503);}
});
