import { SurveyEngineClient } from 'survey-engine-sdk';

const SURVEY_ENGINE_URL = process.env.SURVEY_ENGINE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.SURVEY_ENGINE_API_KEY;

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
  });
}

/** Read the demo user ID from an incoming API request. */
export function getUserIdFromRequest(request: Request): string {
  return request.headers.get('x-demo-user') ?? 'admin';
}
