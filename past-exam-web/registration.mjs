export function requireData(response){
  if(!response?.ok)throw Error(response?.error||'DBを読み込めませんでした');
  const d=response.data;
  if(!d||!Array.isArray(d.schools)||!d.schools.length||!d.db||typeof d.db!=='object'||Array.isArray(d.db))throw Error('DBの応答を確認できませんでした');
  return d;
}
export function cellKey(ctx){
  const parts=['schoolId','year','grade','exam','subject'].map(k=>String(ctx[k]||''));
  if(parts.some(v=>!v||v.includes('||')))throw Error('登録情報を確認してください');
  return parts.join('||');
}
export function contains(data,pending){return (data.db[cellKey(pending.ctx)]?.files||[]).some(f=>f.fileId===pending.file.fileId);}
export function makePatch(data,pending){
  if(!data.schools.some(s=>String(s.id)===pending.ctx.schoolId))throw Error('学校が見つかりません。登録待ちPDFの学校情報を確認してください');
  if(!pending.file.fileId)throw Error('保存済みPDFの識別情報がありません');
  const key=cellKey(pending.ctx),before=data.db[key]??null;
  if(before!==null&&(!Array.isArray(before.files)))throw Error('登録先のファイル一覧を確認できません');
  const after=before===null?{files:[],noan:false,stu:false}:JSON.parse(JSON.stringify(before));
  if(!after.files.some(f=>f.fileId===pending.file.fileId)){
    after.files.push({...pending.file,kind:pending.ctx.kind,isNew:true});after.hasNew=true;
  }
  return [{key,before:before===null?null:JSON.parse(JSON.stringify(before)),after}];
}
export class ExamApi{
  constructor(config,fetcher=fetch){this.config=config;this.fetcher=fetcher;}
  async request(url,options={},timeout=20000){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
    try{const r=await this.fetcher(url,{...options,cache:'no-store',signal:ctrl.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
    finally{clearTimeout(timer);}
  }
  async load(){
    const q=new URLSearchParams({action:'load',pass:this.config.pass,_ts:String(Date.now())});let response;
    try{response=await this.request(this.config.fastUrl+'?'+q);}
    catch(e){response=await this.request(this.config.gasUrl+'?'+q);}
    return requireData(response);
  }
  async upload(file,base64,name){
    const body=new URLSearchParams({action:'uploadAll',pass:this.config.pass,fileName:name,mimeType:'application/pdf',fileData:base64});
    const r=await this.request(this.config.gasUrl,{method:'POST',body},120000);
    if(!r.ok||!r.fileId)throw Error(r.error||'PDFの保存を確認できませんでした');
    return {fileId:String(r.fileId),url:r.url||'',name,date:new Date().toLocaleDateString('ja-JP')};
  }
  async savePatch(patch){
    let r;
    try{r=await this.request(this.config.fastUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'savePatch',pass:this.config.pass,payload:patch})});}
    catch(e){r=await this.request(this.config.gasUrl,{method:'POST',body:new URLSearchParams({action:'savePatch',pass:this.config.pass,payload:JSON.stringify(patch)})},30000);}
    if(!r.ok)throw Error(r.conflict?'別の登録と重なりました。「DB登録だけ再試行」を押してください。':r.error||'DBへ登録できませんでした');
  }
  async register(pending){
    const data=await this.load();
    if(contains(data,pending))return;
    await this.savePatch(makePatch(data,pending));
    const confirmed=await this.load();
    if(!contains(confirmed,pending))throw Error('DBへの反映をまだ確認できません。「DB登録だけ再試行」を押してください。');
  }
}
