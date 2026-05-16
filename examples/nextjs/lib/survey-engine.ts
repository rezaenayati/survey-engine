import { SurveyEngineClient } from 'survey-engine-sdk';

const SURVEY_ENGINE_URL =
    process.env.SURVEY_ENGINE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.SURVEY_ENGINE_API_KEY;

/**
 * Next.js patches `fetch` and may cache Server Component requests by default.
 * Survey data must be fresh or the page can 200 from cache while `POST /responses`
 * (always live in Route Handlers) returns 404 after the DB moved on.
 */
function createNoStoreFetch(): typeof fetch | undefined {
    if (typeof window !== 'undefined') {
        return undefined;
    }
    return (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' });
}

/**
 * Create a server-side SDK client with a given user ID.
 *
 * In a real application the userId comes from your auth layer (JWT claims,
 * session store, etc.). In this demo it comes from the X-Demo-User header
 * forwarded by the Next.js API route from the browser cookie.
 */
export function createClient(userId = 'admin') {
    return new SurveyEngineClient({
        baseUrl: SURVEY_ENGINE_URL,
        userId,
        ...(API_KEY ? { apiKey: API_KEY } : {}),
        fetch: createNoStoreFetch(),
    });
}

/** Public origin for file download/preview URLs (browser and server). Prefer `NEXT_PUBLIC_SURVEY_ENGINE_URL` in `.env.local` so the client bundle can see it. */
export const publicSurveyEngineUrl = (
    process.env.NEXT_PUBLIC_SURVEY_ENGINE_URL ??
    process.env.SURVEY_ENGINE_URL ??
    'http://localhost:3000'
).replace(/\/$/, '');

/** Read the demo user ID from an incoming API request. */
export function getUserIdFromRequest(request: Request): string {
    return request.headers.get('x-demo-user') ?? 'admin';
}
