create table if not exists public.step_timetable_days (
 campus text not null check(campus in ('神領','大手')), day date not null,
 revision integer not null default 1, data jsonb not null default '{"lessons":[],"studentMessage":"","teacherMessage":""}',
 updated_at timestamptz not null default now(), updated_by text not null default '', primary key(campus,day)
);
create table if not exists public.step_timetable_rules (
 campus text not null, weekday integer not null check(weekday between 0 and 6), student_name text not null,
 subject text not null, teacher text not null default '', group_key text not null default '', position integer not null default 0,
 primary key(campus,weekday,student_name,subject)
);
create table if not exists public.step_timetable_events (
 event_key text primary key, campus text not null, day date not null, lesson jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.step_timetable_service (singleton boolean primary key default true check(singleton), token text not null default gen_random_uuid()::text);
insert into public.step_timetable_service(singleton) values(true) on conflict do nothing;
alter table public.step_timetable_days enable row level security;
alter table public.step_timetable_rules enable row level security;
alter table public.step_timetable_events enable row level security;
alter table public.step_timetable_service enable row level security;
revoke all on public.step_timetable_days,public.step_timetable_rules,public.step_timetable_events,public.step_timetable_service from anon,authenticated;
grant all on public.step_timetable_days,public.step_timetable_rules,public.step_timetable_events,public.step_timetable_service to service_role;

create or replace function public.step_timetable_save(p_days jsonb,p_staff text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare d jsonb; actual integer; outrows jsonb:='[]';
begin
 for d in select value from jsonb_array_elements(p_days) order by value->>'campus',value->>'day' loop
  select revision into actual from step_timetable_days where campus=d->>'campus' and day=(d->>'day')::date for update;
  if actual is null or actual<>(d->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
 end loop;
 for d in select value from jsonb_array_elements(p_days) loop
  update step_timetable_days set data=d->'data',revision=revision+1,updated_at=now(),updated_by=p_staff where campus=d->>'campus' and day=(d->>'day')::date;
  select outrows||jsonb_build_array(to_jsonb(t)) into outrows from step_timetable_days t where campus=d->>'campus' and day=(d->>'day')::date;
 end loop;
 return outrows;
end $$;
revoke all on function public.step_timetable_save(jsonb,text) from public,anon,authenticated;
grant execute on function public.step_timetable_save(jsonb,text) to service_role;

create or replace function public.step_timetable_event(p_event text,p_campus text,p_day date,p_lesson jsonb) returns boolean language plpgsql security invoker set search_path=public as $$
declare affected integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_campus||':'||p_day::text,0));
 insert into step_timetable_events(event_key,campus,day,lesson) values(p_event,p_campus,p_day,p_lesson) on conflict do nothing;
 get diagnostics affected=row_count;
 if affected=0 then return false; end if;
 -- A sent event may arrive before the ordinary timetable is generated. Keep it queued in events.
 update step_timetable_days set data=jsonb_set(data,'{lessons}',coalesce(data->'lessons','[]')||jsonb_build_array(p_lesson)),revision=revision+1,updated_at=now(),updated_by='特訓配信連携' where campus=p_campus and day=p_day;
 return true;
end $$;
revoke all on function public.step_timetable_event(text,text,date,jsonb) from public,anon,authenticated;
grant execute on function public.step_timetable_event(text,text,date,jsonb) to service_role;

create or replace function public.step_timetable_generate(p_days jsonb) returns integer language plpgsql security invoker set search_path=public as $$
declare d jsonb; extras jsonb; affected integer; added integer:=0;
begin
 for d in select value from jsonb_array_elements(p_days) order by value->>'campus',value->>'day' loop
  perform pg_advisory_xact_lock(hashtextextended((d->>'campus')||':'||(d->>'day'),0));
  select coalesce(jsonb_agg(lesson),'[]') into extras from step_timetable_events where campus=d->>'campus' and day=(d->>'day')::date;
  insert into step_timetable_days(campus,day,updated_by,data) values(d->>'campus',(d->>'day')::date,d->>'updated_by',jsonb_set(d->'data','{lessons}',(d->'data'->'lessons')||extras)) on conflict do nothing;
  get diagnostics affected=row_count;added:=added+affected;
 end loop;
 return added;
end $$;
revoke all on function public.step_timetable_generate(jsonb) from public,anon,authenticated;
grant execute on function public.step_timetable_generate(jsonb) to service_role;
