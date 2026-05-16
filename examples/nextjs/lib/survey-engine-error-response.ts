import { SurveyEngineError } from 'survey-engine-sdk';

/** Framework default 404 body when no route matches (Express-style; Nest can look similar). */
const frameworkNoRoute = /Cannot (POST|GET|PATCH|DELETE|PUT) \//;

export function surveyEngineErrorToResponse(err: SurveyEngineError): Response {
    const raw = err.body;
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw ?? {});
    if (frameworkNoRoute.test(str)) {
        return Response.json(
            {
                message:
                    'The survey-engine HTTP server returned 404 with a generic "Cannot <METHOD> /path" body — that means no route matched. If other BFF calls (e.g. surveys) work, SURVEY_ENGINE_URL is probably correct: verify with `curl -X POST "$SURVEY_ENGINE_URL/responses" -H "Content-Type: application/json" -H "X-User-ID: admin" -d \'{"surveyId":"<published-survey-uuid>"}\'` from the same machine as Next. Also confirm the API revision exposes POST /responses (not only the deprecated POST /responses/start), and that no reverse proxy strips /responses.',
                code: 'BFF_ENGINE_NO_ROUTE',
                upstream: raw,
            },
            { status: 502 },
        );
    }
    return Response.json(err.body, { status: err.status });
}

export function apiRouteErrorResponse(err: unknown): Response {
    if (err instanceof SurveyEngineError) {
        return surveyEngineErrorToResponse(err);
    }
    console.error(err);
    return Response.json({ message: 'Internal server error' }, { status: 500 });
}
