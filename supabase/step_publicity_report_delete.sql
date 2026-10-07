ALTER TABLE public.step_publicity_reports ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.step_publicity_reports.deleted_at IS '削除時刻。報告本文を消去し一覧から除外。更新カーソルで広報窓口にも削除を反映する。';
