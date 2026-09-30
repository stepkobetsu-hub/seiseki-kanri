
create table public.past_exam_state (
 id boolean primary key default true check(id),
 payload jsonb not null check(jsonb_typeof(payload->'schools')='array' and jsonb_typeof(payload->'db')='object'),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table public.past_exam_auth (digest text primary key, role text not null check(role in ('view','user','admin')));
create table public.past_exam_history (
 revision bigint primary key, payload jsonb not null, saved_at timestamptz not null default now()
);
alter table public.past_exam_state enable row level security;
alter table public.past_exam_auth enable row level security;
alter table public.past_exam_history enable row level security;
revoke all on public.past_exam_state,public.past_exam_auth,public.past_exam_history from public,anon,authenticated;
grant select,insert,update on public.past_exam_state to service_role;
grant select on public.past_exam_auth to service_role;
grant select,insert on public.past_exam_history to service_role;
create function public.past_exam_mutate(p_mode text, p_payload jsonb, p_revision bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.past_exam_state%rowtype; n jsonb; op jsonb; actual jsonb; desired jsonb; k text;
begin
 select * into strict s from public.past_exam_state where id=true for update;
 if p_revision is not null and p_revision<>s.revision then
   return jsonb_build_object('ok',false,'conflict',true,'error','別の端末で更新されています。再読み込みしてください。');
 end if;
 n:=s.payload;
 if p_mode='full' then
   if jsonb_typeof(p_payload->'schools')<>'array' or jsonb_typeof(p_payload->'db')<>'object' then raise exception 'invalid payload'; end if;
   n:=p_payload;
 elsif p_mode='patch' then
   for op in select value from jsonb_array_elements(p_payload) loop
     k:=op->>'key';
     actual:=case when k='__schools__' then n->'schools' when k='__deleted__' then coalesce(n->'deletedFiles','[]'::jsonb) else n->'db'->k end;
     desired:=op->'after';
     if actual is distinct from nullif(op->'before','null'::jsonb) and actual is distinct from nullif(desired,'null'::jsonb) then
       return jsonb_build_object('ok',false,'conflict',true,'error','この項目は他の端末で更新されています。再読み込みしてください。');
     end if;
     if k='__schools__' then n:=jsonb_set(n,'{schools}',desired);
     elsif k='__deleted__' then n:=jsonb_set(n,'{deletedFiles}',desired);
     elsif desired='null'::jsonb then n:=jsonb_set(n,'{db}',(n->'db')-k);
     else n:=jsonb_set(n,array['db',k],desired); end if;
   end loop;
 elsif p_mode='upsert' then
   k:=p_payload->>'key';
   if k='__schools__' then n:=jsonb_set(n,'{schools}',p_payload->'value');
   elsif k='__deleted__' then n:=jsonb_set(n,'{deletedFiles}',p_payload->'value');
   else n:=jsonb_set(n,array['db',k],p_payload->'value'); end if;
 else raise exception 'invalid mode'; end if;
 if jsonb_typeof(n->'schools')<>'array' or jsonb_typeof(n->'db')<>'object' then raise exception 'invalid state'; end if;
 if n is distinct from s.payload then
   insert into public.past_exam_history(revision,payload) values(s.revision,s.payload) on conflict do nothing;
   update public.past_exam_state set payload=n,revision=s.revision+1,updated_at=now() where id=true returning * into s;
 end if;
 return jsonb_build_object('ok',true,'revision',s.revision);
end $$;
revoke all on function public.past_exam_mutate(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.past_exam_mutate(text,jsonb,bigint) to service_role;
