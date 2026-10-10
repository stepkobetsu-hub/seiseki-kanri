-- Manual corrections to entry information; uploaded originals and grades remain intact.
create table public.student_entry_info_edits (
 student_id uuid primary key references public.students(id),
 source_version text not null,
 values jsonb not null check (jsonb_typeof(values)='object'),
 revision uuid not null,
 updated_at timestamptz not null default now()
);
alter table public.student_entry_info_edits enable row level security;
revoke all on public.student_entry_info_edits from public, anon, authenticated;
grant select,insert,update on public.student_entry_info_edits to service_role;
comment on table public.student_entry_info_edits is 'Entry info corrections, only through authenticated STEP runtime; level 4 required for save; source version and revision protect concurrent edits.';
