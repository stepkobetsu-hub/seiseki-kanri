const CACHE='step-meeting-static-20261007-1';
const ROOT=new URL('./',self.location.href);
const STATIC=['meeting-memo.webmanifest','images/meeting-memo/icon-192.png','images/meeting-memo/icon-512.png','images/meeting-memo/icon-maskable-512.png','images/meeting-memo/apple-touch-icon.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('step-meeting-static-')&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==ROOT.origin)return;
 if(STATIC.includes(url.href)){
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}return response;}).catch(()=>caches.match(request).then(cached=>cached||Response.error())));
 }else if(request.mode==='navigate'&&url.pathname===new URL('meeting_memo.html',ROOT).pathname){
  // Keep all memo, report, authentication and API data network-only.
  event.respondWith(fetch(request).catch(()=>new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>面談メモ</title><body style="font-family:sans-serif;padding:24px;color:#102033"><h1>インターネットに接続してください</h1><p>面談メモを開くには通信が必要です。</p><button onclick="location.reload()" style="padding:12px 20px">もう一度開く</button></body></html>',{status:503,headers:{'Content-Type':'text/html;charset=UTF-8','Cache-Control':'no-store'}})));
 }
});
