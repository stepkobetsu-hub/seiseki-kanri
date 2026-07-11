-- Phase 2 架空生徒データ
-- 実在生徒の個人情報を使う前に、この2件でRLSと画面表示を確認する。

insert into public.students (
  student_code,
  name,
  campus,
  grade,
  school_name,
  active,
  source_updated_at
) values
  ('TEST001', 'テスト生徒A', '神領校', '中1', 'テスト中学校', true, now()),
  ('TEST002', 'テスト生徒B', '大手町校', '小6', 'テスト小学校', true, now())
on conflict (student_code) do update set
  name = excluded.name,
  campus = excluded.campus,
  grade = excluded.grade,
  school_name = excluded.school_name,
  active = excluded.active,
  source_updated_at = excluded.source_updated_at;

-- テスト完了後の削除
-- delete from public.students where student_code in ('TEST001', 'TEST002');
