// GitHub Pages向けの公開設定。
// ここに入れてよいのは公開 Project URL と Edge Function URL だけです。
// service_role key、DBパスワード、管理者パスワードは絶対に入れないでください。
window.SEISEKI_CONFIG = window.SEISEKI_CONFIG || {
  supabaseUrl: 'https://wisedgcgwaebtkprdhth.supabase.co',
  adminRuntimeUrl: 'https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/seiseki-admin-runtime-v1'
};
