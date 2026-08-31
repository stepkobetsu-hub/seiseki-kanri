import { CORS_HEADERS } from './storage.ts';

type JsonObject = Record<string, unknown>;

export class AuthRequiredError extends Error {
  readonly code = 'AUTH_REQUIRED';

  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

/**
 * Revalidates a browser session against the common API used by juku_app.html.
 * The common endpoint only authenticates the request when all three response
 * fields (`success`, `role`, and `profile`) match the student-session contract.
 */
export async function validateStudent(
  commonApiUrl: string,
  token: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<JsonObject> {
  if (!token) throw new AuthRequiredError();

  try {
    const response = await fetchImpl(commonApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action: 'getCommonStudentSession', token }),
    });
    if (!response.ok) throw new AuthRequiredError();

    const result = await response.json() as JsonObject;
    if (result.success !== true || result.role !== 'STUDENT' || !isProfile(result.profile)) {
      throw new AuthRequiredError();
    }
    return result.profile;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw new AuthRequiredError();
  }
}

function isProfile(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Converts every common-session validation failure into the public 401 contract. */
export function authRequiredResponse(): Response {
  return Response.json(
    { success: false, code: 'AUTH_REQUIRED', message: 'Authentication required' },
    { status: 401, headers: CORS_HEADERS },
  );
}
