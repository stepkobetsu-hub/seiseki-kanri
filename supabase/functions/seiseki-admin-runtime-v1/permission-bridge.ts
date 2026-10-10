// Server-only authorization bridge. Session identity must be verified before calling.
export function permissionTarget(action:string,requested:unknown){
 const meeting=new Set(['getMeetingBootstrap','getMeetingMemos','saveMeetingMemo','deleteMeetingMemo','getStaffMembers','addStaffMember','deleteStaffMember']);
 const directory=new Set(['getStudentDirectoryDetail','saveStudentDirectory','syncStudentDirectory','enableStudentDirectoryAutoSync']);
 const session=new Set(['verifyStaffSession','persistAdminSession']);
 const shared=new Set(['getEntrySheetData','saveEntrySheetInfo','getStudents','getStudentList']);
 let appId=meeting.has(action)?'public-13':directory.has(action)?'student-directory':'public-12';
 if(action==='verifyStaffSession'&&requested==='public-11')appId='public-11';
 if((shared.has(action)||action==='verifyStaffSession')&&['public-12','public-13','student-directory'].includes(String(requested)))appId=String(requested);
 const settings=new Set(['addSchool','updateSchool','deleteSchool','addStaffMember','deleteStaffMember','reconcileLegacy','syncStudentDirectory','enableStudentDirectoryAutoSync']);
 const mode=action==='verifyStaffSession'&&['public-11','public-12','public-13','student-directory'].includes(String(requested))?'enter':session.has(action)?'session':settings.has(action)?'settings':action.startsWith('delete')?'delete':action.startsWith('save')?'write':action==='enter'?'enter':'view';
 return {appId,mode};
}
export async function checkPermissionBridge(session:Record<string,unknown>,payload:Record<string,unknown>,read:(path:string)=>Promise<unknown>,campuses:string[]=[]){
 if(payload.action==='logoutAdmin')return null;
 const rows=await read('step_permission_bridge_config?select=site_origin,site_service_token,bridge_key,enabled&id=eq.sites&limit=1') as Record<string,unknown>[];
 const config=rows[0];if(!config?.enabled)return null;
 const target=permissionTarget(String(payload.action||''),payload.permissionAppId);
 const origin=String(config.site_origin);if(origin!=='https://step-permissions.mintcocoajasmine.chatgpt.site')throw new Error('Invalid permission service');
 const response=await fetch(origin+'/api/check-context',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+String(config.site_service_token),'Authorization':'Bearer '+String(config.bridge_key)},body:JSON.stringify({staffCode:String(session.staff_code??session.code??''),level:Number(session.permission_level??session.permissionLevel),appId:target.appId,action:target.mode,campus:campuses[0]||String(payload.campus||'')}),signal:AbortSignal.timeout(12000)});
 const result=await response.json() as Record<string,unknown>;if(!response.ok)throw new Error('共通権限の確認に失敗しました。');
 if(result.allowed&&result.scope&&result.scope!=='all'){
  const scope=String(result.scope);if(campuses.some(x=>(x==='大手'?'大手町':x)!==scope))return {...result,allowed:false,reason:'対象校舎外'};
  if(target.mode==='settings')return {...result,allowed:false,reason:'全校舎の設定変更には全校舎の権限が必要です。'};
 }
 return result;
}
