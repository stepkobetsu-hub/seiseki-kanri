create index if not exists idx_students_admin_filters
  on public.students (active, campus, grade, student_code);

create index if not exists idx_test_scores_admin_filters
  on public.test_scores (school_year, test_number, student_id);

create index if not exists idx_report_cards_admin_filters
  on public.report_cards (school_year, term, student_id);

create index if not exists idx_school_preferences_admin_filters
  on public.school_preferences (school_year, student_id);
