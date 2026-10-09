/* Independent, read-only student record panels. */
window.StepDirectoryRecords = (() => {
  const pending = new Map(), cache = new Map();
  const node = (tag, text, cls) => { const n=document.createElement(tag); if(text!=null)n.textContent=String(text); if(cls)n.className=cls; return n; };
  const subjectKeys=['jpn','soc','math','sci','eng','mus','art','pe','tech'];
  const scoreColumns=['年度・回次','国','社','数','理','英','5科計','5科順','9科計','9科順'];
  const reportColumns=['年度・学期','国','社','数','理','英','音','美','体','技','5計','9計'];
  const sum=(row,prefix,count)=>subjectKeys.slice(0,count).every(k=>row[prefix+k]!==''&&row[prefix+k]!=null&&Number.isFinite(Number(row[prefix+k])))?subjectKeys.slice(0,count).reduce((v,k)=>v+Number(row[prefix+k]),0):'';
  function clear(){for(const value of pending.values())value.controller.abort();pending.clear();cache.clear();}
  async function read(action,id,session,force=false){
    const key=session+':'+id+':'+action;
    if(force)cache.delete(key);
    const saved=cache.get(key);if(saved&&Date.now()-saved.time<300000)return saved.data;
    if(pending.has(key))return pending.get(key).promise;
    const controller=new AbortController(),trace='directory-'+crypto.randomUUID();
    let timer;
    const promise=Promise.race([
      (async()=>{
        const response=await StepStaffAuth.fetchRuntime({action,studentId:String(id),token:session,requestTrace:trace},controller.signal);
        const data=await response.json();
        if(!response.ok||data.success!==true)throw Error(data.error||'取得できませんでした。');
        if(controller.signal.aborted)throw Error('読み込みを中止しました。');
        if(cache.size>=80)cache.delete(cache.keys().next().value);
        cache.set(key,{data,time:Date.now()});return data;
      })(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('通信が完了しませんでした。'));},15000);})
    ]).catch(error=>{error.trace=trace;throw error}).finally(()=>{clearTimeout(timer);if(pending.get(key)?.promise===promise)pending.delete(key)});
    pending.set(key,{promise,controller});return promise;
  }
  function table(area,columns,rows,values){
    const t=node('table');t.className='recordsTable';const head=node('thead'),hr=node('tr');
    for(const label of columns)hr.append(node('th',label));head.append(hr);t.append(head);
    const body=node('tbody');for(const row of rows){const tr=node('tr');for(const v of values(row))tr.append(node('td',v==null||v===''?'-':v));body.append(tr);}
    if(!rows.length){const tr=node('tr'),td=node('td','登録されたデータはありません。');td.colSpan=columns.length;tr.append(td);body.append(tr);}
    t.append(body);area.append(t);
  }
  function wishes(area,wish){
    for(const [key,label] of [['pub1','公立1'],['pub2','公立2'],['pub3','公立3'],['pri1','私立1'],['pri2','私立2'],['pri3','私立3']]){
      if(!String(wish?.[key+'name']||'').trim())continue;
      const result=wish.results||{};
      area.append(node('div',label+' '+wish[key+'name']+(wish[key+'dept']?'／'+wish[key+'dept']:'')+(result[key+'type']?' '+result[key+'type']:'')+(result[key]&&result[key]!=='-'?' '+result[key]:'')+(result[key+'enroll']?' 進学先':'')));
    }
    if(!area.children.length)area.closest('.recordPanel').hidden=true;
  }
  function mount(card,student,{session,active,stage='all'}){
    const id=String(student.id),live=area=>area.isConnected&&active()===id;
    for(const [key,value] of pending)if(!key.startsWith(session+':'+id+':')){value.controller.abort();pending.delete(key);}
    const wrap=node('section');wrap.className='directoryRecords';wrap.dataset.studentId=id;card.append(wrap);
    if(stage==='none'){wrap.remove();return;}
    function panel(title,action,render,parent=wrap){
      const box=node('section');box.className='recordPanel';const head=node('div');head.className='recordPanelHead';
      const label=node('h3',title),refresh=node('button','更新','btn secondary small');refresh.type='button';
      const area=node('div','読み込み中…','recordBody');head.append(label,refresh);box.append(head,area);parent.append(box);
      async function load(force=false){
        box.hidden=false;refresh.disabled=true;area.replaceChildren(node('p','読み込み中…','muted'));delete box.dataset.error;
        try{const data=await read(action,id,session,force);if(!live(area))return;area.replaceChildren();render(area,data);}
        catch(error){if(!live(area))return;box.dataset.error='true';area.replaceChildren(node('p','読み込めませんでした：'+error.message+'　通信確認番号：'+error.trace,'error'));}
        finally{if(live(area))refresh.disabled=false;}
      }
      refresh.onclick=()=>load(true);load();return box;
    }
    if(stage==='all')panel('🏫 志望校','getWish',(a,d)=>wishes(a,d.wish));
    const grid=node('div');grid.className='recordsGradeGrid';wrap.append(grid);
    if(['test','test-report','all'].includes(stage))panel('テスト成績','getStudentScores',(a,d)=>table(a,scoreColumns,(d.scores||[]).slice().sort((x,y)=>Number(x.year)-Number(y.year)||Number(x.term)-Number(y.term)),r=>[r.year+'年度 第'+r.term+'回',r.jpn,r.soc,r.math,r.sci,r.eng,r.total5??sum(r,'',5),r.rank5,r.total9??sum(r,'',9),r.rank9]),grid);
    if(['report','test-report','all'].includes(stage))panel('通知表評定','getReports',(a,d)=>table(a,reportColumns,(d.data||[]).slice().sort((x,y)=>Number(y.year)-Number(x.year)||String(y.semester).localeCompare(String(x.semester),'ja',{numeric:true})),r=>[r.year+'年度 '+r.semester,...subjectKeys.map(k=>r['rp_'+k]),sum(r,'rp_',5),sum(r,'rp_',9)]),grid);
    if(['memo','all'].includes(stage)){
      const box=panel('🗒️ 面談記録','getMeetingMemos',(a,d)=>{
        const rows=(d.memos||[]).filter(r=>String(r.studentId)===id).sort((x,y)=>String(y.date).localeCompare(String(x.date)));
        a.append(node('p',rows.length?rows.length+'件の面談記録（新しい順）':'この生徒の面談記録はまだありません。','muted'));
        for(const r of rows){const article=node('article');article.className='meetingMemo';article.append(node('div',String(r.date||'').slice(0,10)+'　相手: '+(r.counterpart||'-')+'　担当: '+(r.staff||'-'),'meetingMeta'),node('div',r.content||'','meetingContent'));a.append(article);}
      });
      const link=node('a','＋ 面談メモを登録','btn secondary small');link.href='meeting_memo.html?studentId='+encodeURIComponent(id);link.target='_blank';link.rel='noopener';box.querySelector('.recordPanelHead').append(link);
    }
  }
  return {mount,clear};
})();
