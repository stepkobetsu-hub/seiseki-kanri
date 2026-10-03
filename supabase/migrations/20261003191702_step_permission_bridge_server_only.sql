CREATE TABLE public.step_permission_bridge_config (id text PRIMARY KEY CHECK (id='sites'),site_origin text NOT NULL,site_service_token text NOT NULL,bridge_key text NOT NULL,enabled boolean NOT NULL DEFAULT false);
ALTER TABLE public.step_permission_bridge_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.step_permission_bridge_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.step_permission_bridge_config TO service_role;
