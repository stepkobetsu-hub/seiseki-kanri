export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

export function preflightResponse(request: Request): Response | null {
  return request.method === 'OPTIONS' ? new Response(null, { status: 204, headers: CORS_HEADERS }) : null;
}
