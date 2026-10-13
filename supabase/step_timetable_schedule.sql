create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('step-timetable-tokkun-sync','*/3 * * * *',$$select net.http_post(url:='https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/step-timetable-runtime-v1',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','scheduledSync','serviceToken',(select token from public.step_timetable_service where singleton)),timeout_milliseconds:=60000);$$);
