-- 成績管理システム Supabase schema
-- service_role は移行・同期スクリプトだけで使用し、ブラウザには置かない。

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'viewer')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,
  name text not null,
  name_kana text,
  campus text,
  grade text,
  school_name text,
  active boolean not null default true,
  enrollment_date date,
  withdrawal_date date,
  source_row integer,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  school_year integer not null,
  test_number integer not null,
  japanese numeric,
  social numeric,
  math numeric,
  science numeric,
  english numeric,
  music numeric,
  art numeric,
  health_pe numeric,
  technology_home numeric,
  total_5 numeric,
  total_9 numeric,
  rank_5 integer,
  rank_9 integer,
  avg_japanese numeric,
  avg_social numeric,
  avg_math numeric,
  avg_science numeric,
  avg_english numeric,
  avg_total_5 numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, school_year, test_number)
);

create table if not exists public.report_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  school_year integer not null,
  term text not null,
  japanese integer,
  social integer,
  math integer,
  science integer,
  english integer,
  music integer,
  art integer,
  health_pe integer,
  technology_home integer,
  total_5 integer,
  total_9 integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, school_year, term)
);

create table if not exists public.school_preferences (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  school_year integer not null default 0,
  wishes jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, school_year)
);

create table if not exists public.meeting_memos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete restrict,
  memo_date date,
  campus text,
  contact_person text,
  staff_name text,
  staff_email text,
  content text not null default '',
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  term_count integer,
  semester_type text,
  schedule jsonb not null default '{}'::jsonb,
  schedule_url text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text,
  notify_ote boolean not null default false,
  notify_jinryo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entry_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  image_urls jsonb not null default '[]'::jsonb,
  pdf_urls jsonb not null default '[]'::jsonb,
  ocr_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  run_mode text not null,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  disabled_count integer not null default 0,
  error_count integer not null default 0,
  error_message text,
  executed_by text
);

create index if not exists idx_students_active on public.students(active);
create index if not exists idx_students_campus on public.students(campus);
create index if not exists idx_students_grade on public.students(grade);
create index if not exists idx_test_scores_student on public.test_scores(student_id);
create index if not exists idx_test_scores_year_number on public.test_scores(school_year, test_number);
create index if not exists idx_report_cards_student on public.report_cards(student_id);
create index if not exists idx_report_cards_year_term on public.report_cards(school_year, term);
create index if not exists idx_meeting_memos_student on public.meeting_memos(student_id);
create index if not exists idx_meeting_memos_date on public.meeting_memos(memo_date desc);
create index if not exists idx_meeting_memos_deleted on public.meeting_memos(is_deleted);
create index if not exists idx_school_preferences_student on public.school_preferences(student_id);

create or replace view public.test_scores_with_students
with (security_invoker = true) as
select
  ts.*,
  s.student_code,
  s.name as student_name,
  s.campus,
  s.grade,
  s.school_name
from public.test_scores ts
join public.students s on s.id = ts.student_id;

create or replace view public.report_cards_with_students
with (security_invoker = true) as
select
  rc.*,
  s.student_code,
  s.name as student_name,
  s.campus,
  s.grade,
  s.school_name
from public.report_cards rc
join public.students s on s.id = rc.student_id;

create or replace view public.school_preferences_with_students
with (security_invoker = true) as
select
  sp.*,
  s.student_code,
  s.name as student_name,
  s.campus,
  s.grade,
  s.school_name
from public.school_preferences sp
join public.students s on s.id = sp.student_id;

create or replace view public.meeting_memos_with_students
with (security_invoker = true) as
select
  mm.*,
  s.student_code,
  s.name as student_name,
  s.grade,
  s.school_name
from public.meeting_memos mm
left join public.students s on s.id = mm.student_id;

alter table public.students enable row level security;
alter table public.profiles enable row level security;
alter table public.test_scores enable row level security;
alter table public.report_cards enable row level security;
alter table public.school_preferences enable row level security;
alter table public.meeting_memos enable row level security;
alter table public.schools enable row level security;
alter table public.staff_members enable row level security;
alter table public.entry_documents enable row level security;
alter table public.sync_logs enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_students_touch on public.students;
create trigger trg_students_touch before update on public.students
for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_test_scores_touch on public.test_scores;
create trigger trg_test_scores_touch before update on public.test_scores
for each row execute function public.touch_updated_at();

drop trigger if exists trg_report_cards_touch on public.report_cards;
create trigger trg_report_cards_touch before update on public.report_cards
for each row execute function public.touch_updated_at();

drop trigger if exists trg_school_preferences_touch on public.school_preferences;
create trigger trg_school_preferences_touch before update on public.school_preferences
for each row execute function public.touch_updated_at();

drop trigger if exists trg_meeting_memos_touch on public.meeting_memos;
create trigger trg_meeting_memos_touch before update on public.meeting_memos
for each row execute function public.touch_updated_at();
