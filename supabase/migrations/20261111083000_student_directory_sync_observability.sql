alter table public.student_directory_sync_state
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_message text,
  add column if not exists last_status text not null default 'never',
  add column if not exists interval_minutes integer not null default 5,
  add column if not exists last_change_count integer not null default 0;

comment on column public.student_directory_sync_state.last_error_message is
  'Sanitized student-directory sync error. Must not contain student names, IDs, or sheet values.';
