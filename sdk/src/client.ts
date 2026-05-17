import type {
    Survey,
    SurveyVersion,
    SurveyAnalytics,
    SurveyResponse,
    PaginatedResult,
    CreateSurveyInput,
    UpdateSurveyInput,
    StartResponseInput,
    UpdateResponseInput,
    ListSurveysQuery,
    ListResponsesQuery,
    AnalyticsQuery,
    LogicEvaluationResult,
    ValidationResult,
    ResponseValidationResult,
    UploadedFile,
    UploadFileOptions,
} from './types';

export interface SurveyEngineClientOptions {
    /** Base URL of the survey-engine instance, e.g. "http://survey-engine:3000" */
    baseUrl: string;
    /**
     * Optional user ID forwarded as X-User-ID header.
     * Set this after authenticating the user in your application.
     */
    userId?: string;
    /**
     * Optional HS256-signed JWT forwarded as X-User-Token. When the engine is
     * configured with USER_TOKEN_SECRET, it verifies the signature and uses the
     * token's `sub` claim as the userId — taking priority over `userId`. Mint
     * server-side with any JWT library using the same shared secret.
     */
    userToken?: string;
    /**
     * Optional global API key when the server has API_KEY set — sent as X-API-Key.
     */
    apiKey?: string;
    /**
     * Optional correlation ID forwarded as X-Correlation-ID header.
     * Useful for distributed tracing.
     */
    correlationId?: string;
    /** Optional custom fetch implementation (useful for testing or edge runtimes) */
    fetch?: typeof fetch;
}

export class SurveyEngineError extends Error {
    /** Stable machine-readable error code from the API (e.g. "SURVEY_NOT_FOUND") */
    readonly code: string;

    constructor(
        public readonly status: number,
        public readonly body: unknown,
        message: string,
    ) {
        super(message);
        this.name = 'SurveyEngineError';
        const b = body as Record<string, unknown> | null;
        this.code =
            (b && typeof b.code === 'string' ? b.code : null) ?? 'UNKNOWN';
    }
}

/**
 * Typed HTTP client for the Survey Engine API.
 *
 * @example
 * ```typescript
 * const client = new SurveyEngineClient({ baseUrl: 'http://localhost:3000', userId: 'user-1' });
 *
 * const survey = await client.surveys.create({ name: 'NPS Survey', schemaJson: { ... } });
 * await client.surveys.publish(survey.id);
 *
 * const response = await client.responses.start({ surveyId: survey.id });
 * await client.responses.update(response.id, { answersJson: { q1: 5 } });
 * await client.responses.complete(response.id);
 * ```
 */
export class SurveyEngineClient {
    readonly surveys: SurveysClient;
    readonly responses: ResponsesClient;
    readonly files: FilesClient;

    constructor(private readonly options: SurveyEngineClientOptions) {
        this.surveys = new SurveysClient(options);
        this.responses = new ResponsesClient(options);
        this.files = new FilesClient(options);
    }
}

// ─── Internal base ────────────────────────────────────────────────────────────

class BaseClient {
    protected readonly baseUrl: string;
    protected readonly fetchFn: typeof fetch;

    constructor(protected readonly options: SurveyEngineClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.fetchFn = options.fetch ?? globalThis.fetch;
    }

    protected async request<T>(
        method: string,
        path: string,
        body?: unknown,
        query?: Record<string, string | number | boolean | undefined>,
    ): Promise<T> {
        const url = new URL(this.baseUrl + path);

        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined) {
                    url.searchParams.set(key, String(value));
                }
            }
        }

        const headers = this.buildHeaders('application/json');

        const res = await this.fetchFn(url.toString(), {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        return this.parseResponse<T>(res);
    }

    protected buildHeaders(contentType?: string): Record<string, string> {
        const headers: Record<string, string> = {};

        if (contentType) {
            headers['Content-Type'] = contentType;
        }

        if (this.options.userId) {
            headers['X-User-ID'] = this.options.userId;
        }
        if (this.options.userToken) {
            headers['X-User-Token'] = this.options.userToken;
        }
        if (this.options.apiKey) {
            headers['X-API-Key'] = this.options.apiKey;
        }
        if (this.options.correlationId) {
            headers['X-Correlation-ID'] = this.options.correlationId;
        }

        return headers;
    }

    protected async parseResponse<T>(res: Response): Promise<T> {
        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new SurveyEngineError(
                res.status,
                errorBody,
                `Survey Engine API error ${res.status}: ${JSON.stringify(errorBody)}`,
            );
        }

        if (res.status === 204) return undefined as T;
        return res.json() as Promise<T>;
    }
}

// ─── Surveys client ───────────────────────────────────────────────────────────

class SurveysClient extends BaseClient {
    create(input: CreateSurveyInput): Promise<Survey> {
        return this.request('POST', '/surveys', input);
    }

    list(query?: ListSurveysQuery): Promise<PaginatedResult<Survey>> {
        return this.request('GET', '/surveys', undefined, query as never);
    }

    get(id: string): Promise<Survey> {
        return this.request('GET', `/surveys/${id}`);
    }

    update(id: string, input: UpdateSurveyInput): Promise<Survey> {
        return this.request('PATCH', `/surveys/${id}`, input);
    }

    delete(id: string): Promise<void> {
        return this.request('DELETE', `/surveys/${id}`);
    }

    publish(id: string): Promise<Survey> {
        return this.request('POST', `/surveys/${id}/publish`);
    }

    /** Duplicate a survey into a new draft — the copy gets "(copy)" appended to its name */
    duplicate(id: string): Promise<Survey> {
        return this.request('POST', `/surveys/${id}/duplicate`);
    }

    listVersions(id: string): Promise<SurveyVersion[]> {
        return this.request('GET', `/surveys/${id}/versions`);
    }

    getVersion(id: string, versionId: string): Promise<SurveyVersion> {
        return this.request('GET', `/surveys/${id}/versions/${versionId}`);
    }

    /** Get the active published version — use this to load the schema into SurveyJS */
    getRuntime(id: string): Promise<SurveyVersion> {
        return this.request('GET', `/surveys/${id}/runtime`);
    }

    validate(id: string): Promise<ValidationResult> {
        return this.request('GET', `/surveys/${id}/validate`);
    }

    evaluateLogic(
        id: string,
        answers: Record<string, unknown>,
    ): Promise<LogicEvaluationResult> {
        return this.request('POST', `/surveys/${id}/evaluate-logic`, {
            answers,
        });
    }

    getAnalytics(id: string, query?: AnalyticsQuery): Promise<SurveyAnalytics> {
        return this.request(
            'GET',
            `/surveys/${id}/analytics`,
            undefined,
            query as never,
        );
    }
}

// ─── Responses client ─────────────────────────────────────────────────────────

class ResponsesClient extends BaseClient {
    /**
     * Start a new response session. Posts to the canonical `/responses` route
     * and falls back to the deprecated `/responses/start` if the server returns
     * 404 — so the SDK works against both pre- and post-route-rename backends.
     */
    async start(input: StartResponseInput): Promise<SurveyResponse> {
        try {
            return await this.request<SurveyResponse>(
                'POST',
                '/responses',
                input,
            );
        } catch (err) {
            if (err instanceof SurveyEngineError && err.status === 404) {
                return this.request<SurveyResponse>(
                    'POST',
                    '/responses/start',
                    input,
                );
            }
            throw err;
        }
    }

    list(query?: ListResponsesQuery): Promise<PaginatedResult<SurveyResponse>> {
        return this.request('GET', '/responses', undefined, query as never);
    }

    get(id: string): Promise<SurveyResponse> {
        return this.request('GET', `/responses/${id}`);
    }

    update(id: string, input: UpdateResponseInput): Promise<SurveyResponse> {
        return this.request('PATCH', `/responses/${id}`, input);
    }

    complete(id: string): Promise<SurveyResponse> {
        return this.request('POST', `/responses/${id}/complete`);
    }

    delete(id: string): Promise<void> {
        return this.request('DELETE', `/responses/${id}`);
    }

    validate(id: string): Promise<ResponseValidationResult> {
        return this.request('GET', `/responses/${id}/validate`);
    }

    evaluateLogic(id: string): Promise<LogicEvaluationResult> {
        return this.request('GET', `/responses/${id}/logic`);
    }
}

// ─── Files client ─────────────────────────────────────────────────────────────

/** Upload, download, and delete binaries for SurveyJS `file` questions (`POST/GET/DELETE /files`). */
class FilesClient extends BaseClient {
    /**
     * Multipart upload. When `surveyId` and `questionId` are set, the API applies the
     * survey question’s `acceptedTypes` / `maxSize` rules.
     */
    async upload(
        file: Blob | ArrayBuffer | Uint8Array,
        options: UploadFileOptions = {},
    ): Promise<UploadedFile> {
        const form = new FormData();
        const blob = file instanceof Blob ? file : new Blob([file]);
        form.append('file', blob, options.filename ?? 'upload');

        if (options.surveyId) {
            form.append('surveyId', options.surveyId);
        }
        if (options.questionId) {
            form.append('questionId', options.questionId);
        }

        const res = await this.fetchFn(`${this.baseUrl}/files`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: form,
        });

        return this.parseResponse<UploadedFile>(res);
    }

    async download(id: string): Promise<Response> {
        const res = await this.fetchFn(`${this.baseUrl}/files/${id}`, {
            method: 'GET',
            headers: this.buildHeaders(),
        });

        if (!res.ok) {
            await this.parseResponse<never>(res);
        }

        return res;
    }

    /** Remove an uploaded file (and backing object, when using cloud storage). */
    delete(id: string): Promise<void> {
        return this.request('DELETE', `/files/${id}`);
    }
}
