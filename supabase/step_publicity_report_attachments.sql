ALTER TABLE public.step_publicity_reports ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.step_publicity_reports ADD CONSTRAINT step_publicity_reports_attachments_limit CHECK (jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=5);
CREATE TABLE public.step_publicity_report_files (
 id uuid PRIMARY KEY,
 report_id uuid NOT NULL,
 author_code text NOT NULL CHECK(length(author_code) BETWEEN 1 AND 40),
 original_name text NOT NULL CHECK(length(original_name) BETWEEN 1 AND 200),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/gif','image/webp','image/heic','application/pdf')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 object_path text NOT NULL UNIQUE,
 uploaded boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX step_publicity_report_files_report_idx ON public.step_publicity_report_files(report_id);
ALTER TABLE public.step_publicity_report_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.step_publicity_report_files FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.step_publicity_report_files TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('step-publicity-report-files','step-publicity-report-files',false,10485760,ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic','application/pdf']);
COMMENT ON TABLE public.step_publicity_report_files IS '良い事・行事予定の非公開添付。共通講師認証と報告閲覧権限または広報窓口専用キーを確認し、短期署名URLを発行。';
COMMENT ON COLUMN public.step_publicity_reports.attachments IS '添付ID・ファイル名・種別・サイズ。非公開オブジェクトのパスや署名URLを公開・永続保存しない。';
CREATE POLICY step_publicity_files_private_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated USING (bucket_id<>'step-publicity-report-files') WITH CHECK (bucket_id<>'step-publicity-report-files');
