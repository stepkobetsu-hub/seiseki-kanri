ALTER TABLE public.meeting_memos ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=5);
CREATE TABLE public.meeting_memo_files (
 id uuid PRIMARY KEY,
 memo_id text NOT NULL,
 student_code text NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/gif','image/webp','image/heic','application/pdf')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 object_path text NOT NULL UNIQUE,
 uploaded boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meeting_memo_files_memo_idx ON public.meeting_memo_files(memo_id);
ALTER TABLE public.meeting_memo_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meeting_memo_files FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.meeting_memo_files TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('step-meeting-files','step-meeting-files',false,10485760,ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic','application/pdf']);
CREATE POLICY meeting_files_private_only ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated USING (bucket_id<>'step-meeting-files') WITH CHECK (bucket_id<>'step-meeting-files');
COMMENT ON TABLE public.meeting_memo_files IS '面談メモの非公開添付。既存の講師セッションと面談権限・校舎を検証するEdge Functionのみアクセス。未保存・取り外し済みファイルは閲覧不可。';
