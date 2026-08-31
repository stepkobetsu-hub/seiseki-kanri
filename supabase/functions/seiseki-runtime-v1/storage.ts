export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

/** Call before authentication/body parsing in the Edge Function entry point. */
export function preflightResponse(request: Request): Response | null {
  return request.method === 'OPTIONS' ? new Response(null, { status: 204, headers: CORS_HEADERS }) : null;
}

type JsonObject = Record<string, unknown>;

const WISH_FIELDS = [
  'pub1name', 'pub1dept', 'pub2name', 'pub2dept', 'pub3name', 'pub3dept',
  'pri1name', 'pri1dept', 'pri2name', 'pri2dept', 'pri3name', 'pri3dept',
] as const;

export function parseWishResults(value: unknown): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Splits the browser/GAS-compatible wish payload into the two database columns.
 * Keep passing the original payload to the legacy GAS mirror; do not mirror this
 * normalized object because GAS expects `results` to remain a JSON string.
 */
export function schoolPreferenceRow(payload: JsonObject, studentId: string, schoolYear: number) {
  const wishes = Object.fromEntries(WISH_FIELDS.map(field => [field, String(payload[field] ?? '')]));
  return {
    student_id: studentId,
    school_year: schoolYear,
    wishes,
    results: parseWishResults(payload.results),
  };
}

/** Used by both saveWish and the getWish read-through seed path. */
export async function upsertSchoolPreference(
  supabase: { from(table: string): { upsert(row: unknown, options: unknown): PromiseLike<{ error: unknown }> } },
  payload: JsonObject,
  studentId: string,
  schoolYear: number,
) {
  const { error } = await supabase
    .from('school_preferences')
    .upsert(schoolPreferenceRow(payload, studentId, schoolYear), { onConflict: 'student_id,school_year' });
  if (error) throw error;
}
