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
    b.disabled=true;
    try{const r=await send({action:'getMeetingAttachment',id:memo.id,attachmentId:a.id});
     if(!r.success||!/^https:\/\/wisedgcgwaebtkprdhth\.supabase\.co\/storage\/v1\//.test(r.url||''))throw Error(r.error||'添付を開けませんでした。');
     openViewer(a,r.url);
    }catch(e){const error=node('p',e.message);error.setAttribute('role','alert');list.append(error);}finally{b.disabled=false;}
   };list.append(b);
  }parent.append(list);
 }
 function openViewer(file,url){
  const dialog=node('dialog');dialog.className='meetingViewer';dialog.setAttribute('aria-label','添付書類：'+file.name);
  const head=node('div');head.className='meetingViewerHead';const title=node('h2',file.name),close=node('button','✕ 閉じる');close.type='button';close.onclick=()=>dialog.close();head.append(title,close);
  const toolbar=node('div');toolbar.className='meetingViewerTools';
  const stage=node('div');stage.className='meetingViewerStage';const status=node('div','読み込み中…');status.className='meetingViewerStatus';status.setAttribute('role','status');
  const original=node('a','元のファイルを開く');original.href=url;original.target='_blank';original.rel='noopener noreferrer';
  const foot=node('div');foot.className='meetingViewerFoot';foot.append(status,original);dialog.append(head,toolbar,stage,foot);
  document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();});dialog.showModal();
  if(file.mimeType==='application/pdf'){
   const frame=node('iframe');frame.title=file.name;frame.src=url;frame.className='meetingViewerPdf';stage.append(frame);toolbar.append(node('span','PDFの拡大・回転は、PDF内のツールバーから操作できます。'));status.textContent='PDF';return;
  }
  const scene=node('div');scene.className='meetingViewerScene';const paper=node('div');paper.className='meetingViewerPaper';const img=node('img');img.alt=file.name;img.draggable=false;img.referrerPolicy='no-referrer';paper.append(img);scene.append(paper);stage.append(scene);
  let angle=0,scale=1,ready=false,fitMode=true;const controls=[],points=new Map();let pinch=null;
  function draw(){
   if(!ready)return;
   const rotated=angle%180!==0,w=rotated?img.naturalHeight:img.naturalWidth,h=rotated?img.naturalWidth:img.naturalHeight;
   paper.style.width=(w*scale)+'px';paper.style.height=(h*scale)+'px';img.style.width=img.naturalWidth+'px';img.style.height=img.naturalHeight+'px';img.style.transform='translate(-50%,-50%) rotate('+angle+'deg) scale('+scale+')';
   status.textContent=Math.round(scale*100)+'%　／　'+angle+'°';
  }
  function fit(){if(!ready)return;fitMode=true;const rotated=angle%180!==0;scale=Math.min((stage.clientWidth-32)/(rotated?img.naturalHeight:img.naturalWidth),(stage.clientHeight-32)/(rotated?img.naturalWidth:img.naturalHeight),1);scale=Math.max(.02,scale);draw();stage.scrollLeft=0;stage.scrollTop=0;}
  function zoom(value){if(!ready)return;fitMode=false;const x=(stage.scrollLeft+stage.clientWidth/2)/Math.max(1,stage.scrollWidth),y=(stage.scrollTop+stage.clientHeight/2)/Math.max(1,stage.scrollHeight);scale=Math.max(.02,Math.min(8,value));draw();stage.scrollLeft=x*stage.scrollWidth-stage.clientWidth/2;stage.scrollTop=y*stage.scrollHeight-stage.clientHeight/2;}
  function rotate(delta){if(!ready)return;angle=(angle+delta+360)%360;if(fitMode)fit();else draw();}
  function button(text,fn){const b=node('button',text);b.type='button';b.disabled=true;b.onclick=fn;controls.push(b);toolbar.append(b);return b;}
  button('↶ 左に回転',()=>rotate(-90));button('↷ 右に回転',()=>rotate(90));button('− 縮小',()=>zoom(scale/1.25));button('＋ 拡大',()=>zoom(scale*1.25));button('画面に合わせる',fit);button('100%',()=>zoom(1));
  const help=node('span','ドラッグで移動・ホイール／２本指で拡大縮小');help.className='meetingViewerHelp';toolbar.append(help);
  img.onload=()=>{ready=true;controls.forEach(b=>b.disabled=false);fit();};img.onerror=()=>{status.textContent='画像を表示できませんでした。「元のファイルを開く」から確認してください。';};img.src=url;
  stage.addEventListener('wheel',e=>{if(!ready)return;e.preventDefault();zoom(scale*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.003));},{passive:false});
  const distance=()=>{const a=[...points.values()];return a.length===2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;};
  stage.addEventListener('pointerdown',e=>{if(!ready)return;e.preventDefault();stage.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size===2)pinch={distance:distance(),scale};});
  stage.addEventListener('pointermove',e=>{const old=points.get(e.pointerId);if(!old)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size===2&&pinch?.distance)zoom(pinch.scale*distance()/pinch.distance);else if(points.size===1){stage.scrollLeft-=e.clientX-old.x;stage.scrollTop-=e.clientY-old.y;}});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,e=>{points.delete(e.pointerId);pinch=null;});
  const resize=()=>{if(fitMode)fit();};window.addEventListener('resize',resize);dialog.addEventListener('close',()=>window.removeEventListener('resize',resize),{once:true});
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
