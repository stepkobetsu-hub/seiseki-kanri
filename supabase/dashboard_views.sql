-- 速報画面向け。ブラウザ側で全件集計しないための軽量ビュー/RPC。

create or replace view public.latest_test_scores
with (security_invoker = true) as
select distinct on (student_id)
  ts.*,
  s.student_code,
  s.name as student_name,
  s.campus,
  s.grade,
  s.school_name
from public.test_scores ts
join public.students s on s.id = ts.student_id
where s.active = true
order by student_id, school_year desc, test_number desc, updated_at desc;

create or replace view public.latest_report_cards
with (security_invoker = true) as
select distinct on (student_id)
  rc.*,
  s.student_code,
  s.name as student_name,
  s.campus,
  s.grade,
  s.school_name
from public.report_cards rc
join public.students s on s.id = rc.student_id
where s.active = true
order by student_id, school_year desc, term desc, updated_at desc;

create or replace function public.score_summary(
  p_school_year integer default null,
  p_test_number integer default null,
  p_campus text default null
)
returns table (
  score_count bigint,
  avg_total_5 numeric,
  max_total_5 numeric,
  min_total_5 numeric
)
language sql
stable
as $$
  select
    count(*),
    round(avg(ts.total_5), 1),
    max(ts.total_5),
    min(ts.total_5)
  from public.test_scores ts
  join public.students s on s.id = ts.student_id
  where (p_school_year is null or ts.school_year = p_school_year)
    and (p_test_number is null or ts.test_number = p_test_number)
    and (p_campus is null or s.campus = p_campus)
    and ts.total_5 is not null;
$$;
