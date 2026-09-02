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

alter table public.schools enable row level security;
revoke all on table public.schools from anon, authenticated;

create table if not exists public.seiseki_admin_mirror_queue (
  mutation_id text primary key,
  action text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'failed', 'mirrored')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seiseki_admin_mirror_queue enable row level security;
revoke all on table public.seiseki_admin_mirror_queue from anon, authenticated;

create index if not exists idx_seiseki_admin_mirror_retry
  on public.seiseki_admin_mirror_queue (status, next_attempt_at)
  where status in ('pending', 'failed');
