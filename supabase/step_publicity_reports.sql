CREATE TABLE public.step_publicity_reports (
 id uuid PRIMARY KEY,
 author_code text NOT NULL CHECK (length(author_code) BETWEEN 1 AND 40),
 author_name text NOT NULL CHECK (length(author_name) <= 80),
 campus text NOT NULL CHECK (campus IN ('両校','神領校','大手町校')),
 category text NOT NULL CHECK (category IN ('良い事・頑張り','行事予定','教室の様子','プログラミング','その他')),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 3000),
 event_date date,
 deleted_at timestamptz,
 external_use boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 last_mutation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX step_publicity_reports_author_created_idx ON public.step_publicity_reports(author_code,created_at DESC,id DESC);
CREATE INDEX step_publicity_reports_updated_idx ON public.step_publicity_reports(updated_at,id);
ALTER TABLE public.step_publicity_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.step_publicity_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.step_publicity_reports TO service_role;
CREATE TABLE public.step_publicity_reader_config (
 id text PRIMARY KEY,
 key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.step_publicity_reader_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.step_publicity_reader_config FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.step_publicity_reader_config TO service_role;
COMMENT ON TABLE public.step_publicity_reports IS '講師の良い事・行事予定報告。Edge Functionで共通講師認証・本人/塾長の編集権限を確認。STEP広報窓口で取り込む。';
COMMENT ON TABLE public.step_publicity_reader_config IS 'STEP広報窓口の読み取り専用連携キーのSHA256。平文キーはSitesのsecretのみ。';

