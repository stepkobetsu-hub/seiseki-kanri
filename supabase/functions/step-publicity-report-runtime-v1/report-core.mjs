export class ReportError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const campuses = ['両校','神領校','大手町校'];
const categories = ['良い事・頑張り','行事予定','教室の様子','プログラミング','その他'];
const select = 'id,author_code,author_name,campus,category,title,body,event_date,external_use,revision,created_at,updated_at,deleted_at';
function text(v,max,required=true) { if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw new ReportError(400,'入力内容を確認してください。');return v.trim(); }
function q(table,params={}) { return table+'?'+new URLSearchParams(params); }
export function validateReport(p) {
  if(!uuid.test(p.id)||!uuid.test(p.mutationId)||!campuses.includes(p.campus)||!categories.includes(p.category)||typeof p.externalUse!=='boolean')throw new ReportError(400,'入力内容を確認してください。');
  let eventDate=p.eventDate||null;
  if(eventDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)||!Number.isFinite(Date.parse(eventDate))||new Date(eventDate).toISOString().slice(0,10)!==eventDate))throw new ReportError(400,'日付を確認してください。');
  return {campus:p.campus,category:p.category,title:text(p.title,120),body:text(p.body,3000),event_date:eventDate,external_use:p.externalUse};
}
export function canEdit(actor,row) { return actor.level===4||actor.code===row.author_code; }
export async function reportAction(p,{pg,verify,authorize,verifyReader,now=()=>new Date().toISOString()}) {
  if(p.action==='ownerFeed'){
    await verifyReader(p.readerKey);
    const params={select,order:'updated_at.asc,id.asc',limit:'100'};
    if(p.cursor){
      const {at,id}=p.cursor;
      if(typeof at!=='string'||!/^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(at)||!Number.isFinite(Date.parse(at))||!uuid.test(id))throw new ReportError(400,'Invalid cursor');
      params.or='(updated_at.gt.'+at+',and(updated_at.eq.'+at+',id.gt.'+id+'))';
    }
    const reports=await pg(q('step_publicity_reports',params));const last=reports.at(-1);
    return {success:true,reports,cursor:last?{at:last.updated_at,id:last.id}:p.cursor||null,hasMore:reports.length===100};
  }
  if(!['list','save','delete'].includes(p.action))throw new ReportError(400,'この操作には対応していません。');
  const actor=await verify(p.token);
  if(!actor.code||![1,2,3,4].includes(actor.level))throw new ReportError(403,'この画面を利用する権限がありません。');
  if(p.action==='list'){
    const scope=await authorize(actor,'view',null);
    const offset=Number(p.offset||0);if(!Number.isInteger(offset)||offset<0||offset>100000)throw new ReportError(400,'Invalid offset');
    const params={select,deleted_at:'is.null',order:'created_at.desc,id.desc',limit:'51',offset:String(offset)};
    if(actor.level!==4)params.author_code='eq.'+actor.code;
    if(scope!=='all')params.campus='eq.'+scope;
    const rows=await pg(q('step_publicity_reports',params));
    return {success:true,reports:rows.slice(0,50),hasMore:rows.length>50,actor:{code:actor.code,level:actor.level}};
  }
  if(p.action==='delete'){
    if(!uuid.test(p.id)||!uuid.test(p.mutationId)||!Number.isInteger(p.revision)||p.revision<1)throw new ReportError(400,'削除する報告を確認してください。');
    const old=(await pg(q('step_publicity_reports',{id:'eq.'+p.id,limit:'1'})))[0];
    if(!old)throw new ReportError(404,'報告が見つかりません。');
    if(!canEdit(actor,old))throw new ReportError(403,'この報告は本人または塾長だけが削除できます。');
    await authorize(actor,'delete',old.campus);
    if(old.deleted_at&&old.last_mutation_id===p.mutationId)return {success:true,deletedId:old.id,replayed:true};
    if(old.deleted_at)throw new ReportError(404,'この報告は削除済みです。一覧を更新してください。');
    if(p.revision!==old.revision)throw new ReportError(409,'別の画面で変更されています。一覧を更新して、内容を確認してから削除してください。');
    const at=now();
    const saved=await pg(q('step_publicity_reports',{id:'eq.'+p.id,revision:'eq.'+old.revision,deleted_at:'is.null'}),{method:'PATCH',body:JSON.stringify({title:'削除済みの報告',body:'この報告は削除されました。',event_date:null,external_use:false,deleted_at:at,revision:old.revision+1,last_mutation_id:p.mutationId,updated_at:at}),headers:{Prefer:'return=representation'}});
    if(!saved[0])throw new ReportError(409,'変更が重なりました。一覧を更新してから、もう一度削除してください。');
    return {success:true,deletedId:p.id};
  }
  const value=validateReport(p);
  const rows=await pg(q('step_publicity_reports',{id:'eq.'+p.id,limit:'1'}));const old=rows[0];
  if(old&&!canEdit(actor,old))throw new ReportError(403,'この報告は本人または塾長だけが編集できます。');
  if(old?.deleted_at)throw new ReportError(404,'この報告は削除済みです。一覧を更新してください。');
  await authorize(actor,'write',value.campus,old?.campus);
  if(old?.last_mutation_id===p.mutationId)return {success:true,report:old,replayed:true};
  const at=now();
  if(old){
    if(p.revision!==old.revision)throw new ReportError(409,'別の画面で変更されています。以前の報告を更新してから、もう一度編集してください。');
    const saved=await pg(q('step_publicity_reports',{id:'eq.'+p.id,revision:'eq.'+old.revision}),{method:'PATCH',body:JSON.stringify({...value,revision:old.revision+1,last_mutation_id:p.mutationId,updated_at:at}),headers:{Prefer:'return=representation'}});
    if(!saved[0])throw new ReportError(409,'変更が重なりました。以前の報告を更新してから、もう一度編集してください。');
    return {success:true,report:saved[0]};
  }
  if(p.revision!==0)throw new ReportError(404,'報告が見つかりません。');
  const row={id:p.id,...value,author_code:actor.code,author_name:text(p.authorName??'',80,false),revision:1,last_mutation_id:p.mutationId,created_at:at,updated_at:at};
  const saved=await pg(q('step_publicity_reports',{on_conflict:'id'}),{method:'POST',body:JSON.stringify(row),headers:{Prefer:'resolution=ignore-duplicates,return=representation'}});
  if(saved[0])return {success:true,report:saved[0]};
  const latest=(await pg(q('step_publicity_reports',{id:'eq.'+p.id,limit:'1'})))[0];
  if(latest?.author_code===actor.code&&latest.last_mutation_id===p.mutationId)return {success:true,report:latest,replayed:true};
  throw new ReportError(409,'送信内容が重なりました。画面を更新して再度お試しください。');
}
