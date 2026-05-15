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
   * Optional correlation ID forwarded as X-Correlation-ID header.
   * Useful for distributed tracing.
   */
  correlationId?: string;
  /** Optional custom fetch implementation (useful for testing or edge runtimes) */
  fetch?: typeof fetch;
}

export class SurveyEngineError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'SurveyEngineError';
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

  constructor(private readonly options: SurveyEngineClientOptions) {
    this.surveys = new SurveysClient(options);
    this.responses = new ResponsesClient(options);
  }
}

// ─── Internal base ────────────────────────────────────────────────────────────

class BaseClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.userId) {
      headers['X-User-ID'] = this.options.userId;
    }
    if (this.options.correlationId) {
      headers['X-Correlation-ID'] = this.options.correlationId;
    }

    const res = await this.fetchFn(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

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

  evaluateLogic(id: string, answers: Record<string, unknown>): Promise<LogicEvaluationResult> {
    return this.request('POST', `/surveys/${id}/evaluate-logic`, { answers });
  }

  getAnalytics(id: string, query?: AnalyticsQuery): Promise<SurveyAnalytics> {
    return this.request('GET', `/surveys/${id}/analytics`, undefined, query as never);
  }
}

// ─── Responses client ─────────────────────────────────────────────────────────

class ResponsesClient extends BaseClient {
  start(input: StartResponseInput): Promise<SurveyResponse> {
    return this.request('POST', '/responses/start', input);
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
