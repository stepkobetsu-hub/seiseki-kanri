-- Phase 2 RLS policies
-- 匿名ユーザーには一切公開しない。
-- 管理者判定は auth.users.id -> profiles.user_id -> profiles.role = 'admin' で行う。

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile"
on public.profiles for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "admins can read profiles" on public.profiles;
create policy "admins can read profiles"
on public.profiles for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can manage profiles" on public.profiles;
create policy "admins can manage profiles"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "authenticated admins can read students" on public.students;
drop policy if exists "admins can read students" on public.students;
create policy "admins can read students"
on public.students for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can insert students" on public.students;
create policy "admins can insert students"
on public.students for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update students" on public.students;
create policy "admins can update students"
on public.students for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can delete students" on public.students;
create policy "admins can delete students"
on public.students for delete
to authenticated
using (public.is_admin());

drop policy if exists "authenticated admins can read test_scores" on public.test_scores;
drop policy if exists "admins can read test_scores" on public.test_scores;
create policy "admins can read test_scores"
on public.test_scores for select
to authenticated
using (public.is_admin());

drop policy if exists "authenticated admins can read report_cards" on public.report_cards;
drop policy if exists "admins can read report_cards" on public.report_cards;
create policy "admins can read report_cards"
on public.report_cards for select
to authenticated
using (public.is_admin());

drop policy if exists "authenticated admins can read school_preferences" on public.school_preferences;
drop policy if exists "admins can read school_preferences" on public.school_preferences;
create policy "admins can read school_preferences"
on public.school_preferences for select
to authenticated
using (public.is_admin());

drop policy if exists "authenticated admins can read meeting_memos" on public.meeting_memos;
drop policy if exists "admins can read meeting_memos" on public.meeting_memos;
create policy "admins can read meeting_memos"
on public.meeting_memos for select
to authenticated
using (public.is_admin());

drop policy if exists "authenticated admins can read schools" on public.schools;
drop policy if exists "admins can read schools" on public.schools;
create policy "admins can read schools"
on public.schools for select
to authenticated
using (public.is_admin());

drop policy if exists "authenticated admins can read staff_members" on public.staff_members;
drop policy if exists "admins can read staff_members" on public.staff_members;
create policy "admins can read staff_members"
on public.staff_members for select
to authenticated
using (public.is_admin());

drop policy if exists "authenticated admins can read entry_documents" on public.entry_documents;
drop policy if exists "admins can read entry_documents" on public.entry_documents;
create policy "admins can read entry_documents"
on public.entry_documents for select
to authenticated
using (public.is_admin());

drop policy if exists "authenticated admins can read sync_logs" on public.sync_logs;
drop policy if exists "admins can read sync_logs" on public.sync_logs;
create policy "admins can read sync_logs"
on public.sync_logs for select
to authenticated
using (public.is_admin());

-- 成績・通知表・志望校・面談メモのブラウザ書き込みはPhase 2では有効化しない。
-- 保存処理は従来GASのまま維持する。
