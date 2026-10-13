export const norm=s=>String(s||'').normalize('NFKC').replace(/髙/g,'高').replace(/﨑/g,'崎').replace(/\s/g,'');
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
export function dayPlus(day,n){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function timeParts(s){const m=String(s).normalize('NFKC').match(/(\d{1,2}):(\d{2})\s*[-–—~〜～]\s*(\d{1,2}):(\d{2})/);if(!m)return null;const a=+m[1]*60 + +m[2],b=+m[3]*60 + +m[4];return a<b&&b<=1440&&+m[2]<60&&+m[4]<60?[a,b]:null}
export function normalizeTime(s){const p=timeParts(s);if(!p)throw Error('時間は17:10-18:25の形式で指定してください');return p.map(t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')).join('-')}
export function validate(data){
 if(!data||!Array.isArray(data.lessons)||data.lessons.length>400)throw Error('授業データが不正です');
 const ids=new Set();
 for(const l of data.lessons){if(!l.id||ids.has(l.id))throw Error('授業IDが重複しています');ids.add(l.id);if(!l.name&&!['監督'].includes(l.kind))throw Error('生徒名を入力してください');normalizeTime(l.time);if(!['通常','プロ','特訓','土曜特訓','監督'].includes(l.kind))throw Error('授業区分が不正です');if(Object.values(l).some(v=>typeof v==='string'&&v.length>1000))throw Error('入力が長すぎます');}
 const live=data.lessons.filter(l=>l.status!=='欠席'&&l.status!=='休講');
 for(const l of live){
  if(l.studentId){const p=timeParts(l.time);if(live.some(x=>x.id!==l.id&&x.studentId===l.studentId&&timeParts(x.time)[0]<p[1]&&p[0]<timeParts(x.time)[1]))throw Error(l.name+'さんの授業時間が重複しています');}
 }
 const teachers=[...new Set(live.map(l=>norm(l.teacher)).filter(Boolean))];
 for(const teacher of teachers){const rows=live.filter(l=>norm(l.teacher)===teacher);for(const t of [...new Set(rows.flatMap(l=>timeParts(l.time)))]){
  const active=rows.filter(l=>timeParts(l.time)[0]<=t&&t<timeParts(l.time)[1]);if(!active.length)continue;
  const special=active.filter(l=>l.kind!=='通常');
  if(special.length){if(active.some(l=>l.kind==='通常')||new Set(active.map(l=>l.group)).size!==1||new Set(active.map(l=>l.kind)).size!==1)throw Error(teacher+'先生の通常授業と集団授業・監督が重複しています');if(active[0].kind==='プロ'&&active.length>10)throw Error(teacher+'先生のプロは10人までです');}
  else if(active.length>2||new Set(active.map(l=>l.group)).size>1)throw Error(teacher+'先生の同時担当は同じ班の2人までです');
 }}
 for(const key of ['studentMessage','teacherMessage'])if(String(data[key]||'').length>4000)throw Error('メッセージは4000文字までです');
 return data;
}
export function baseLessons(details,rules,campus,day){
 const weekday=new Date(day+'T00:00:00Z').getUTCDay(),out=[];
 for(const d of details){const s=d.detail?.student||{};if(!['1','0'].includes(String(s.flag))||(String(s.campus).includes('大手')?'大手':'神領')!==campus)continue;
  for(const [i,l] of (s.lessons||[]).entries()){if('日月火水木金土'.indexOf(String(l.weekday)[0])!==weekday)continue;
   const time=normalizeTime(l.time),subject=String(l.subject||''),kind=/プロ|プログラミング|QU/i.test(subject)?'プロ':/特訓/.test(subject)?'特訓':'通常';
   const rule=rules.find(r=>r.campus===campus&&r.weekday===weekday&&norm(r.student_name)===norm(s.name)&&norm(r.subject)===norm(subject));
   out.push({id:crypto.randomUUID(),studentId:String(d.student_code),name:s.name,grade:s.grade||'',time,subject,kind,teacher:rule?.teacher||'',group:rule?.group_key||('未割当-'+d.student_code+'-'+i),position:rule?.position||0,status:'出席',note:'',origin:'master'});
  }
 }
 return out.sort((a,b)=>a.time.localeCompare(b.time)||a.position-b.position||a.name.localeCompare(b.name,'ja'));
}
export function parseHistory(h,students){
 if(!/特訓部屋/.test(h.titleLine||''))return [];
 const title=String(h.titleLine),m=title.match(/(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})/),t=title.match(/\d{1,2}[：:]\d{2}\s*[-–—~〜～]\s*\d{1,2}[：:]\d{2}/);
 if(!m||!t)return [];const day=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');if(!Number.isFinite(Date.parse(day))||day<today())return [];
 const names=String(h.targetLine||'').split(' / ')[0].split(/[、,]/).map(s=>norm(s.replace(/^[小中高][１２３４５６1-6]\s*/, '').replace(/さん$/,''))).filter(Boolean),out=[];
 for(const name of names){const matches=students.filter(s=>norm(s.name)===name);if(matches.length!==1)continue;const s=matches[0];out.push({key:'history:'+h.id+':'+s.student_code,campus:String(s.campus).includes('大手')?'大手':'神領',day,lesson:{id:'tokkun:'+h.id+':'+s.student_code,studentId:s.student_code,name:s.name,grade:s.grade,time:normalizeTime(t[0]),subject:'特訓',kind:'特訓',teacher:'',group:'特訓部屋',position:0,status:'出席',note:'STEP配信から自動登録',origin:'message'}})}return out;
}
