import {ReportError,canEdit} from './report-core.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_FILE_SIZE=10*1024*1024;
export const MAX_FILES=5;
export const BUCKET='step-publicity-report-files';
const q=(table,p)=>table+'?'+new URLSearchParams(p);
const meta=r=>({id:r.id,name:r.original_name,mimeType:r.mime_type,size:r.size_bytes});
export function identifyFile(bytes){
 const ascii=(a,b)=>new TextDecoder().decode(bytes.slice(a,b));
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',ext:'jpg'};
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return {mime:'image/png',ext:'png'};
 if(/^GIF8[79]a$/.test(ascii(0,6)))return {mime:'image/gif',ext:'gif'};
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return {mime:'image/webp',ext:'webp'};
 if(ascii(0,5)==='%PDF-')return {mime:'application/pdf',ext:'pdf'};
 if(ascii(4,8)==='ftyp'&&/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8,12)))return {mime:'image/heic',ext:'heic'};
 throw new ReportError(400,'写真（JPEG・PNG・GIF・WebP・HEIC）またはPDFを選択してください。');
}
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function cleanName(name){return String(name||'添付ファイル').replace(/[\x00-\x1f\x7f\/\\]/g,'_').slice(0,200);}
export async function uploadAttachment(p,{pg,verify,authorize,storage,now=()=>new Date().toISOString()}){
 if(!uuid.test(p.reportId)||!uuid.test(p.attachmentId)||!['両校','神領校','大手町校'].includes(p.campus))throw new ReportError(400,'添付する報告を確認してください。');
 const actor=await verify(p.token);if(!actor.code||![1,2,3,4].includes(actor.level))throw new ReportError(403,'この画面を利用する権限がありません。');
 const old=(await pg(q('step_publicity_reports',{id:'eq.'+p.reportId,limit:'1'})))[0];
 if(old?.deleted_at)throw new ReportError(404,'この報告は削除済みです。');
 if(old&&!canEdit(actor,old))throw new ReportError(403,'この報告に添付する権限がありません。');
 await authorize(actor,'write',p.campus,old?.campus);
 if(!p.file||typeof p.file.arrayBuffer!=='function'||!Number.isFinite(p.file.size)||p.file.size<1||p.file.size>MAX_FILE_SIZE)throw new ReportError(413,'添付は１ファイル10MBまでです。');
 const bytes=new Uint8Array(await p.file.arrayBuffer()),type=identifyFile(bytes),hash=await digest(bytes);
 const query=q('step_publicity_report_files',{id:'eq.'+p.attachmentId,limit:'1'});
 let row=(await pg(query))[0];
 if(!row){
  const value={id:p.attachmentId,report_id:p.reportId,author_code:actor.code,original_name:cleanName(p.file.name),mime_type:type.mime,size_bytes:bytes.length,content_hash:hash,object_path:p.reportId+'/'+p.attachmentId+'.'+type.ext,uploaded:false,created_at:now()};
  const rows=await pg(q('step_publicity_report_files',{on_conflict:'id'}),{method:'POST',body:JSON.stringify(value),headers:{Prefer:'resolution=ignore-duplicates,return=representation'}});row=rows[0]||(await pg(query))[0];
 }
 if(!row||row.report_id!==p.reportId||row.author_code!==actor.code||row.content_hash!==hash)throw new ReportError(409,'添付ファイルが重なりました。選び直してください。');
 if(!row.uploaded){
  await storage('upload',row.object_path,{bytes,mime:type.mime});
  await pg(query,{method:'PATCH',body:JSON.stringify({uploaded:true})});
 }
 const latest=(await pg(q('step_publicity_reports',{id:'eq.'+p.reportId,limit:'1'})))[0];
 if(latest?.deleted_at){await cleanupAttachments(p.reportId,{pg,storage});throw new ReportError(404,'この報告は削除済みです。');}
 return {success:true,attachment:meta(row)};
}
export async function resolveAttachments(ids,old,reportId,actor,pg){
 if(ids===undefined)return old?.attachments||[];
 if(!Array.isArray(ids)||ids.length>MAX_FILES||ids.some(id=>!uuid.test(id))||new Set(ids).size!==ids.length)throw new ReportError(400,'添付は５点までです。');
 if(!ids.length)return [];
 const rows=await pg(q('step_publicity_report_files',{id:'in.('+ids.join(',')+')',report_id:'eq.'+reportId,uploaded:'eq.true'}));
 const existing=new Set((old?.attachments||[]).map(a=>a.id));
 return ids.map(id=>{const row=rows.find(r=>r.id===id);if(!row||(row.author_code!==actor.code&&actor.level!==4&&!existing.has(id)))throw new ReportError(400,'添付の保存を確認できませんでした。選び直してください。');return meta(row);});
}
export async function signedAttachment(p,row,{pg,storage}){
 if(!uuid.test(p.attachmentId)||!row||row.deleted_at||!(row.attachments||[]).some(a=>a.id===p.attachmentId))throw new ReportError(404,'添付ファイルが見つかりません。');
 const file=(await pg(q('step_publicity_report_files',{id:'eq.'+p.attachmentId,report_id:'eq.'+row.id,uploaded:'eq.true',limit:'1'})))[0];if(!file)throw new ReportError(404,'添付ファイルが見つかりません。');
 return {success:true,...meta(file),url:await storage('sign',file.object_path)};
}
export async function cleanupAttachments(reportId,{pg,storage}){
 const rows=await pg(q('step_publicity_report_files',{report_id:'eq.'+reportId,select:'id,object_path'}));
 if(rows.length){await storage('remove',rows.map(r=>r.object_path));await pg(q('step_publicity_report_files',{report_id:'eq.'+reportId}),{method:'DELETE'});}
}
