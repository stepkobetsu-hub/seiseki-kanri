-- 入塾日は生徒マスタ☆マスタC列から初回取り込みし、通常表示はPostgresから取得する。
alter table public.students add column if not exists admission_date date;
alter table public.students add column if not exists admission_date_text text;
comment on column public.students.admission_date is '入塾日: 生徒マスタから初回取り込み。通常同期では上書きしない。';
comment on column public.students.admission_date_text is '生徒マスタC列の原文。日付不正や年省略の場合も保持。';
