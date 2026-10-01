// Snapshot of the school master, verified 2026-10-01. No student or registration data.
export const bundledSchools = [
  {
    "id": "s1",
    "name": "南城中学",
    "examCount": 3
  },
  {
    "id": "s2",
    "name": "高蔵寺中学",
    "examCount": 5
  },
  {
    "id": "s3",
    "name": "志段味中学",
    "examCount": 5
  },
  {
    "id": "s4",
    "name": "坂下中学",
    "examCount": 5
  },
  {
    "id": "s5",
    "name": "鷹来中学",
    "examCount": 5
  },
  {
    "id": "s6",
    "name": "西部中学",
    "examCount": 5
  },
  {
    "id": "s7",
    "name": "東部中学",
    "examCount": 5
  }
];
export function normalizeSchools(value){
  if(!Array.isArray(value)||!value.length)throw Error('学校一覧が空です');
  const schools=value.map(s=>{
    if(!s||typeof s.id!=='string'||!s.id.trim()||s.id.includes('||')||typeof s.name!=='string'||!s.name.trim()||!Number.isInteger(s.examCount)||s.examCount<1||s.examCount>20)throw Error('学校一覧の形式を確認できません');
    return {id:s.id,name:s.name,examCount:s.examCount};
  });
  if(new Set(schools.map(s=>s.id)).size!==schools.length)throw Error('学校IDが重複しています');
  return schools;
}
export function restoreSchools(storage,key){
  try{return normalizeSchools(JSON.parse(storage.getItem(key)));}catch{return normalizeSchools(bundledSchools);}
}
