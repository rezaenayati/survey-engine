/**
 * Thin API layer — calls your backend (Option A) or survey-engine directly (Option B).
 *
 * Swap BASE_URL to switch between the two patterns:
 *   Option A (via your backend):  '/api'                    → proxied to express-backend
 *   Option B (direct to engine):  '/survey-engine'          → proxied to survey-engine
 *
 * In production you would never expose survey-engine directly to the internet;
 * your backend acts as the gateway and handles auth.
 */

// ── Change this to '/survey-engine' to bypass the backend proxy ──
const BASE_URL = '/api';

// The user ID would normally come from your auth system (JWT claim, session, etc.)
// Here we read it from localStorage so you can set it via the browser console.
function getUserId(): string | null {
  return localStorage.getItem('userId');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const userId = getUserId();
  if (userId) headers['X-API-Key'] = userId; // forwarded by express-backend as X-User-ID

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(`API ${method} ${path} → ${res.status}: ${JSON.stringify(error)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  /** Fetch the schema of the active published version */
  getSchema(surveyId: string) {
    return request<Record<string, unknown>>('GET', `/surveys/${surveyId}/schema`);
  },

  /** Start a new response session; returns { responseId } */
  startResponse(surveyId: string): Promise<{ responseId: string }> {
    return request('POST', `/surveys/${surveyId}/responses`);
  },

  /** Save partial progress (call on page navigation) */
  saveProgress(surveyId: string, responseId: string, answers: Record<string, unknown>) {
    return request('PATCH', `/surveys/${surveyId}/responses/${responseId}`, { answers });
  },

  /** Final submission */
  submit(surveyId: string, responseId: string, answers: Record<string, unknown>) {
    return request('POST', `/surveys/${surveyId}/responses/${responseId}/submit`, { answers });
  },
};
