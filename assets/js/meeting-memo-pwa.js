(function(){
 'use strict';
 const buttons=[...document.querySelectorAll('[data-install-meeting]')];
 const dialog=document.getElementById('meetingInstallDialog');
 let prompt=null;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const update=()=>buttons.forEach(b=>b.hidden=standalone());
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;update();});
 window.addEventListener('appinstalled',()=>{prompt=null;buttons.forEach(b=>b.hidden=true);});
 buttons.forEach(button=>button.addEventListener('click',async()=>{
  if(prompt){const available=prompt;prompt=null;try{await available.prompt();await available.userChoice;}catch{}update();return;}
  document.getElementById('meetingInstallHelp').textContent=/iPhone|iPad|iPod/.test(navigator.userAgent)?'Safariでこのページを開き、共有ボタンから「ホーム画面に追加」を選んでください。':'スマホのChromeでこのページを開き、右上のメニューから「ホーム画面に追加」→「インストール」を選んでください。「インストール」がない場合はショートカットとして追加できます。';
  dialog.showModal();
 }));
 update();
 if('serviceWorker' in navigator&&location.protocol!=='file:'){
  // Only control this page, so other STEP apps retain their own worker behavior.
  navigator.serviceWorker.register('meeting-memo-sw.js',{scope:'./meeting_memo.html',updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});
 }
})();
