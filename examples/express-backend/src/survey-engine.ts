/**
 * Singleton survey-engine client.
 *
 * In a real application this is instantiated once at startup and shared
 * across request handlers. The userId is set per-request (see index.ts).
 */
import { SurveyEngineClient } from '@survey-engine/sdk';

export const surveyEngine = new SurveyEngineClient({
  baseUrl: process.env.SURVEY_ENGINE_URL ?? 'http://localhost:3000',
});
