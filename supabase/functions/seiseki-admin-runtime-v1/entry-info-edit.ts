type Obj = Record<string, unknown>;
export const ENTRY_FIELDS = ['club','nickname','commuteMethod','currentLessons','pastLessons','familyRequest'] as const;
export function cleanEntryEdit(value: unknown): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('編集内容を確認してください。');
  const input=value as Obj, result:Obj={};
  for(const key of [...ENTRY_FIELDS,'notes']) {
    if(typeof input[key]!=='string'||String(input[key]).length>5000)throw new Error('入力内容が長すぎるか、形式が不正です。');
    result[key]=input[key];
  }
  if(!Array.isArray(input.family)||input.family.length>30)throw new Error('家族情報を確認してください。');
  result.family=input.family.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('家族情報を確認してください。');
    const row:Obj={};for(const key of ['name','relation','job','workplace','grade']) {
      const v=(raw as Obj)[key];if(typeof v!=='string'||v.length>300)throw new Error('家族情報を確認してください。');row[key]=v;
    }return row;
  });
  return result;
}
export function mergeEntryEdit(original:Obj|null, edit:Obj):Obj {
  const data:Obj={...(original||{})};
  for(const key of ENTRY_FIELDS)data[key]=edit[key];
  data.family=edit.family;
  const memo=String(data.ocrMemo||''),position=memo.indexOf('AI_JSON:');
  let ai:Obj={};
  if(position>=0) { try{ai=JSON.parse(memo.slice(position+8));}catch{throw new Error('原本の読み取りデータを確認してください。');} }
  ai={...ai,entryInfo:{...((ai.entryInfo||{}) as Obj)},family:edit.family,notes:edit.notes};
  for(const key of ENTRY_FIELDS)(ai.entryInfo as Obj)[key]=edit[key];
  data.ocrMemo=(position>=0?memo.slice(0,position):memo+'\n')+'AI_JSON:'+JSON.stringify(ai);
  return data;
}
