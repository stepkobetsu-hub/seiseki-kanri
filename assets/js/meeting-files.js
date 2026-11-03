(function(root){
 'use strict';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const label=a=>(a.mimeType==='application/pdf'?'📄 ':'📷 ')+a.name;
 async function request(data){
  const token=localStorage.getItem('adminSystemPortalSessionToken')||sessionStorage.getItem('adminSystemPortalSessionToken')||'';
  const response=await StepStaffAuth.fetchRuntime({...data,token,permissionAppId:'public-13'});
  const r=await response.json();if(!response.ok||!r.success)throw Error(r.error||'添付を取得できませんでした。');return r;
 }
 function render(parent,memo,send=request){
  if(!memo.attachments?.length)return;
  const list=node('div');list.className='meetingFiles';
  for(const a of memo.attachments){
   const b=node('button',label(a));b.type='button';b.className='meetingFile';b.title='添付書類を開く：'+a.name;
   b.onclick=async()=>{
    const win=window.open('about:blank','_blank');if(win)win.opener=null;b.disabled=true;
    try{const r=await send({action:'getMeetingAttachment',id:memo.id,attachmentId:a.id});
     if(!r.success||!/^https:\/\/wisedgcgwaebtkprdhth\.supabase\.co\/storage\/v1\//.test(r.url||''))throw Error(r.error||'添付を開けませんでした。');
     if(win)win.location.replace(r.url);else{const link=node('a','「'+a.name+'」を開く');link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';list.append(link);}
    }catch(e){if(win)win.close();const error=node('p',e.message);error.setAttribute('role','alert');list.append(error);}finally{b.disabled=false;}
   };list.append(b);
  }parent.append(list);
 }
 function editor(host,changed=()=>{}){
  let files=[],busy=false,boundId='',boundStudent='';
  const input=node('input');input.type='file';input.multiple=true;input.accept='.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.pdf';input.setAttribute('aria-label','写真・PDFを添付');
  const help=node('p','写真・PDFを５点まで添付できます（１ファイル10MBまで）。保存するとメモの下に表示されます。');help.className='meetingFileHelp';
  const list=node('div'),status=node('p');status.setAttribute('role','status');status.className='meetingFileHelp';host.append(input,help,list,status);
  function draw(){list.replaceChildren();input.disabled=busy;
   for(const a of files){const row=node('div');row.className='meetingFileEdit';row.append(node('span',label(a)+'（'+(a.size/1048576).toFixed(1)+'MB）'));
    const remove=node('button','取り外す');remove.type='button';remove.disabled=busy;remove.onclick=()=>{files=files.filter(x=>x.id!==a.id);if(!files.length){boundId='';boundStudent='';}draw();changed();};row.append(remove);list.append(row);}
  }
  input.onchange=()=>{const selected=[...input.files];input.value='';status.textContent='';
   if(files.length+selected.length>5){status.textContent='添付は５点までです。';return;}
   if(selected.some(f=>f.size===0||f.size>10*1048576)){status.textContent='空のファイルや10MBを超えるファイルは添付できません。';return;}
   if(selected.some(f=>!(/\.(jpe?g|png|gif|webp|heic|heif|pdf)$/i.test(f.name)))){status.textContent='写真またはPDFを選択してください。';return;}
   files.push(...selected.map(file=>({id:crypto.randomUUID(),name:file.name,mimeType:file.type,size:file.size,file})));draw();changed();
  };
  return {
   ids:()=>files.map(a=>a.id),
   snapshot:()=>({files:files.filter(a=>a.uploaded).map(({id,name,mimeType,size})=>({id,name,mimeType,size,uploaded:true})),boundId,boundStudent}),
   load(items=[],id='',student=''){if(busy)return;files=items.map(a=>({...a,uploaded:true}));boundId=id;boundStudent=String(student);status.textContent='';draw();},
   async upload(id,student,send=request){
    if(busy)throw Error('添付の保存中です。');
    if(files.length&&boundId&&(id!==boundId||String(student)!==boundStudent))throw Error('添付のあるメモの生徒は変更できません。取り外してから選び直してください。');
    boundId=id;boundStudent=String(student);busy=true;draw();
    try{for(let i=0;i<files.length;i++){const a=files[i];if(a.uploaded)continue;
      status.textContent='添付を保存中… '+(i+1)+'／'+files.length;
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('ファイルを読み込めませんでした。'));reader.readAsDataURL(a.file);});
      const r=await send({action:'saveMeetingAttachment',id,studentId:String(student),attachmentId:a.id,name:a.name,base64,mutationId:a.id});
      if(!r.success)throw Error(r.error||'添付の保存に失敗しました。');Object.assign(a,r.attachment,{uploaded:true});changed();
     }status.textContent=files.length?'添付の保存を確認しました。メモを保存しています…':'';
    }finally{busy=false;draw();}
   }
  };
 }
 root.StepMeetingFiles=Object.freeze({render,editor});
})(window);
