-- Supabase SQL Editorで実行してください。
-- stepkobetsu@gmail.com のAuthユーザーを public.profiles に admin として登録し直します。

insert into public.profiles (user_id, role, display_name)
select id, 'admin', '管理者'
from auth.users
where email = 'stepkobetsu@gmail.com'
on conflict (user_id) do update set
  role = excluded.role,
  display_name = excluded.display_name;

select
  u.id as auth_user_id,
  u.email,
  p.user_id as profile_user_id,
  p.role,
  p.display_name
from auth.users u
left join public.profiles p on p.user_id = u.id
where u.email = 'stepkobetsu@gmail.com';
