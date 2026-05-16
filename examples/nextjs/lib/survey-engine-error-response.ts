import { SurveyEngineError } from 'survey-engine-sdk';

/**
 * Framework default 404 body when no route matches — captures method + path.
 * Stops the path at whitespace or quote so it works on both raw strings
 * (`Cannot POST /files`) and JSON-stringified bodies (`"...Cannot POST /files"`).
 */
const frameworkNoRoute = /Cannot (POST|GET|PATCH|DELETE|PUT) (\/[^\s"'\\]*)/;

export function surveyEngineErrorToResponse(err: SurveyEngineError): Response {
    const raw = err.body;
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw ?? {});
    const match = frameworkNoRoute.exec(str);
    if (match) {
        const method = match[1];
        const path = match[2];
        return Response.json(
            {
                message:
                    `The survey-engine HTTP server returned 404 with a generic "Cannot ${method} ${path}" body — no route matched. ` +
                    `If other BFF calls work, SURVEY_ENGINE_URL is probably correct: verify with ` +
                    `\`curl -X ${method} "$SURVEY_ENGINE_URL${path}" -H "X-User-ID: admin"\` from the same machine as Next. ` +
                    `Otherwise the running engine build is older than the SDK expects — confirm the API revision exposes ${method} ${path}, ` +
                    `that the relevant module (e.g. FilesModule for /files) is registered in app.module.ts, ` +
                    `and that no reverse proxy strips the path.`,
                code: 'BFF_ENGINE_NO_ROUTE',
                method,
                path,
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
