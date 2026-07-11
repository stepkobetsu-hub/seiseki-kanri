-- Delete only Phase 2 test students.
-- Run this in Supabase SQL Editor before importing real data.

delete from public.students
where student_code in ('TEST001', 'TEST002');

select
  student_code,
  name,
  campus,
  grade,
  active
from public.students
where student_code in ('TEST001', 'TEST002')
order by student_code;
