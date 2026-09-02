create table if not exists public.seiseki_admin_sessions (
  token_hash text primary key,
  staff_code text not null,
  permission_level text not null,
  expires_at timestamptz not null,
  verified_at timestamptz not null default now()
);

alter table public.seiseki_admin_sessions enable row level security;
revoke all on table public.seiseki_admin_sessions from anon, authenticated;
