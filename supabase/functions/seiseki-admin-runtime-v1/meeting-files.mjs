// Private attachments; caller must verify the session and campus permission first.
export const MAX_SIZE=10*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const q=(table,p)=>table+'?'+new URLSearchParams(p);
const fail=(status,message)=>{throw Object.assign(new Error(message),{meetingFileStatus:status});};
const meta=r=>({id:r.id,name:r.name,mimeType:r.mime_type,size:r.size_bytes});
export function fileType(b){
 const text=(a,z)=>new TextDecoder().decode(b.slice(a,z));
 if(b[0]===255&&b[1]===216&&b[2]===255)return ['image/jpeg','jpg'];
 if([137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))return ['image/png','png'];
 if(/^GIF8[79]a$/.test(text(0,6)))return ['image/gif','gif'];
 if(text(0,4)==='RIFF'&&text(8,12)==='WEBP')return ['image/webp','webp'];
 if(text(0,5)==='%PDF-')return ['application/pdf','pdf'];
 if(text(4,8)==='ftyp'&&/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(text(8,12)))return ['image/heic','heic'];
 fail(400,'写真（JPEG・PNG・GIF・WebP・HEIC）またはPDFを選択してください。');
}
export async function uploadMeetingFile(p,{pg,storage}){
 if(!uuid.test(p.attachmentId)||!p.id||!p.studentId)fail(400,'生徒と面談メモを確認してください。');
 const students=await pg(q('students',{student_code:'eq.'+p.studentId,select:'student_code',limit:1}));
 if(!students.length)fail(404,'生徒が見つかりません。');
 const old=(await pg(q('meeting_memos',{id:'eq.'+p.id,limit:1})))[0];
 if(old&&old.student_code!==p.studentId)fail(400,'選択中の生徒とメモの生徒が異なります。');
 if(typeof p.base64!=='string'||p.base64.length>Math.ceil(MAX_SIZE/3)*4)fail(413,'添付は１ファイル10MBまでです。');
 let bytes;try{bytes=Uint8Array.from(atob(p.base64),c=>c.charCodeAt(0));}catch{fail(400,'ファイルを読み取れませんでした。');}
 if(!bytes.length||bytes.length>MAX_SIZE)fail(413,'添付は１ファイル10MBまでです。');
 const [mime,ext]=fileType(bytes);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const path=q('meeting_memo_files',{id:'eq.'+p.attachmentId,limit:1});
 let row=(await pg(path))[0];
 if(row&&(row.memo_id!==p.id||row.student_code!==p.studentId||row.content_hash!==hash))fail(409,'添付が重複しました。選び直してください。');
 if(!row){
  const value={id:p.attachmentId,memo_id:p.id,student_code:p.studentId,name:String(p.name||'添付ファイル').replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200),mime_type:mime,size_bytes:bytes.length,content_hash:hash,object_path:p.attachmentId+'.'+ext};
  const rows=await pg(q('meeting_memo_files',{on_conflict:'id'}),{method:'POST',body:JSON.stringify(value),headers:{Prefer:'resolution=ignore-duplicates,return=representation'}});
  row=rows[0]||(await pg(path))[0];
 }
 if(!row||row.memo_id!==p.id||row.student_code!==p.studentId||row.content_hash!==hash)fail(409,'添付が重複しました。選び直してください。');
 if(!row.uploaded){await storage('upload',row.object_path,bytes,mime);await pg(path,{method:'PATCH',body:JSON.stringify({uploaded:true})});}
 return {success:true,attachment:meta(row)};
}
export async function resolveMeetingFiles(ids,old,id,studentId,{pg}){
 if(ids===undefined)return old?.attachments||[];
 if(!Array.isArray(ids)||ids.length>5||ids.some(x=>!uuid.test(x))||new Set(ids).size!==ids.length)fail(400,'添付は５点までです。');
 if(!ids.length)return [];
 const rows=await pg(q('meeting_memo_files',{id:'in.('+ids.join(',')+')',memo_id:'eq.'+id,student_code:'eq.'+studentId,uploaded:'eq.true'}));
 return ids.map(id=>{const row=rows.find(r=>r.id===id);if(!row)fail(400,'添付の保存を確認できませんでした。選び直してください。');return meta(row);});
}
export async function openMeetingFile(p,{pg,storage}){
 if(!uuid.test(p.attachmentId)||!p.id)fail(400,'添付ファイルを確認してください。');
 const memo=(await pg(q('meeting_memos',{id:'eq.'+p.id,limit:1})))[0];
 if(!memo||!(memo.attachments||[]).some(a=>a.id===p.attachmentId))fail(404,'添付ファイルが見つかりません。');
 const row=(await pg(q('meeting_memo_files',{id:'eq.'+p.attachmentId,memo_id:'eq.'+memo.id,student_code:'eq.'+memo.student_code,uploaded:'eq.true',limit:1})))[0];
 if(!row)fail(404,'添付ファイルが見つかりません。');
 return {success:true,...meta(row),url:await storage('sign',row.object_path)};
}
