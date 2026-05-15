/**
 * Survey Engine — Backend Integration Example
 *
 * This Express app shows how a backend service delegates all survey logic
 * to survey-engine. It:
 *   - Proxies the survey schema to whatever frontend the team is already using
 *   - Starts / saves / completes responses on behalf of its authenticated users
 *   - Exposes survey analytics to internal dashboards
 *
 * The key pattern: your backend authenticates the user (JWT, session, API key —
 * whatever you already have), then forwards the resolved user ID as X-User-ID
 * when calling survey-engine. survey-engine itself performs no authentication.
 */

import express, { Request, Response, NextFunction } from 'express';
import { SurveyEngineClient, SurveyEngineError } from '@survey-engine/sdk';

const SURVEY_ENGINE_URL = process.env.SURVEY_ENGINE_URL ?? 'http://localhost:3000';

const app = express();
app.use(express.json());

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Replace with your actual auth: JWT validation, session lookup, API key check…
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-api-key'] as string | undefined;
  if (!userId) {
    res.status(401).json({ message: 'Missing X-API-Key header' });
    return;
  }
  // Attach to res.locals so route handlers can access it
  res.locals.userId = userId;
  next();
}

// ─── Client factory ───────────────────────────────────────────────────────────
// Creates a per-request client so the user's ID is forwarded to survey-engine.
function client(res: Response): SurveyEngineClient {
  return new SurveyEngineClient({
    baseUrl: SURVEY_ENGINE_URL,
    userId: res.locals.userId as string,
  });
}

// ─── Error handler ───────────────────────────────────────────────────────────
function handleError(err: unknown, res: Response): void {
  if (err instanceof SurveyEngineError) {
    res.status(err.status).json(err.body);
  } else {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /surveys/:id/schema
 * Return the active published survey schema so a frontend can render it.
 * This is the only survey-engine endpoint a frontend ever needs to know about.
 */
app.get('/surveys/:id/schema', authenticate, async (req, res) => {
  try {
    const version = await client(res).surveys.getRuntime(req.params.id);
    res.json(version.schemaJson);
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * POST /surveys/:id/responses
 * Start a new response session for the authenticated user.
 * Returns a responseId the frontend should store for subsequent saves.
 */
app.post('/surveys/:id/responses', authenticate, async (req, res) => {
  try {
    const response = await client(res).responses.start({
      surveyId: req.params.id,
      metadata: {
        // Attach any context useful for analytics: app version, locale, etc.
        appVersion: req.headers['x-app-version'] ?? 'unknown',
        locale: req.headers['accept-language'] ?? 'en',
      },
    });
    res.status(201).json({ responseId: response.id });
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * PATCH /surveys/:id/responses/:responseId
 * Save partial answers. Call this whenever the user navigates to the next page.
 */
app.patch('/surveys/:id/responses/:responseId', authenticate, async (req, res) => {
  try {
    const updated = await client(res).responses.update(req.params.responseId, {
      answersJson: req.body.answers,
    });
    res.json({ status: updated.status });
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * POST /surveys/:id/responses/:responseId/submit
 * Final submission. Validates and marks the response as completed.
 */
app.post('/surveys/:id/responses/:responseId/submit', authenticate, async (req, res) => {
  try {
    const se = client(res);

    // Save final answers first, then mark as complete
    if (req.body.answers) {
      await se.responses.update(req.params.responseId, {
        answersJson: req.body.answers,
      });
    }

    const completed = await se.responses.complete(req.params.responseId);
    res.json({ status: completed.status, completedAt: completed.completedAt });
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * GET /surveys/:id/analytics  (internal / admin route)
 * Proxy analytics data for internal dashboards.
 */
app.get('/surveys/:id/analytics', authenticate, async (req, res) => {
  try {
    const analytics = await client(res).surveys.getAnalytics(req.params.id);
    res.json(analytics);
  } catch (err) {
    handleError(err, res);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Example backend running on http://localhost:${PORT}`);
  console.log(`Forwarding survey logic to survey-engine at ${SURVEY_ENGINE_URL}`);
});
