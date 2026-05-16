import type { SurveySchema, LogicSchema } from './schema.types';

// ─── Enums ───────────────────────────────────────────────────────────────────

export type SurveyStatus = 'draft' | 'published' | 'archived';
export type ResponseStatus =
    | 'started'
    | 'in_progress'
    | 'completed'
    | 'abandoned';

// ─── Entities ────────────────────────────────────────────────────────────────

export type WebhookEvent = 'response.started' | 'response.completed';

export interface SurveySettings {
    allowAnonymous: boolean;
    requireAuth: boolean;
    accessTokenRequired: boolean;
    startDate?: string;
    endDate?: string;
    maxResponses?: number;
    /** URL to receive webhook events via HTTP POST */
    webhookUrl?: string;
    /**
     * HMAC-SHA256 secret for verifying webhook payloads.
     * Falls back to the server's WEBHOOK_SECRET environment variable.
     */
    webhookSecret?: string;
    /** Which events to deliver. Defaults to all events when webhookUrl is set. */
    webhookEvents?: WebhookEvent[];
}

/** Payload POSTed to webhookUrl on each event */
export interface WebhookPayload {
    event: WebhookEvent;
    timestamp: string;
    surveyId: string;
    responseId: string;
    respondentId: string | null;
    answersJson: Record<string, unknown>;
}

export interface Survey {
    id: string;
    createdBy: string | null;
    name: string;
    description: string | null;
    status: SurveyStatus;
    activeVersionId: string | null;
    draftSchemaJson: SurveySchema | null;
    draftLogicJson: LogicSchema | null;
    settings: SurveySettings;
    createdAt: string;
    updatedAt: string;
}

export interface SurveyVersion {
    id: string;
    surveyId: string;
    versionNumber: number;
    schemaJson: SurveySchema;
    logicJson: LogicSchema | null;
    publishedBy: string | null;
    checksum: string;
    isDeprecated: boolean;
    createdAt: string;
}

export interface SurveyResponse {
    id: string;
    surveyId: string;
    surveyVersionId: string;
    respondentId: string | null;
    answersJson: Record<string, unknown>;
    metadata: Record<string, unknown>;
    status: ResponseStatus;
    startedAt: string;
    updatedAt: string;
    completedAt: string | null;
}

export type FileStorageProvider = 'local' | 's3';

export interface UploadedFile {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    storageProvider: FileStorageProvider;
    url: string | null;
    createdAt: string;
}

export interface FileAnswerValue {
    fileId: string;
    originalName?: string;
    mimeType?: string;
    size?: number;
    url?: string | null;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface PaginatedResult<T> {
    data: T[];
    meta: PaginationMeta;
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export interface CreateSurveyInput {
    name: string;
    description?: string;
    schemaJson?: Record<string, unknown>;
    logicJson?: Record<string, unknown>;
    settings?: Partial<SurveySettings>;
}

export interface UpdateSurveyInput {
    name?: string;
    description?: string;
    schemaJson?: Record<string, unknown>;
    logicJson?: Record<string, unknown>;
    settings?: Partial<SurveySettings>;
    status?: SurveyStatus;
}

export interface StartResponseInput {
    surveyId: string;
    answersJson?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface UpdateResponseInput {
    answersJson: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface UploadFileOptions {
    surveyId?: string;
    questionId?: string;
    filename?: string;
    mimeType?: string;
}

export interface PaginationQuery {
    page?: number;
    limit?: number;
    sortOrder?: 'ASC' | 'DESC';
}

export interface ListSurveysQuery extends PaginationQuery {
    sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'status';
}

export interface ListResponsesQuery extends PaginationQuery {
    sortBy?: 'startedAt' | 'updatedAt' | 'completedAt';
    surveyId?: string;
    status?: ResponseStatus;
}

export interface AnalyticsQuery {
    startDate?: string;
    endDate?: string;
    versionMode?: 'all' | 'latest' | 'specific';
    versionId?: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface LogicEvaluationResult {
    visibleQuestions: string[];
    hiddenQuestions: string[];
    visiblePages: string[];
    hiddenPages: string[];
    requiredQuestions: string[];
    calculatedValues: Record<string, unknown>;
    validationErrors?: Record<string, string>;
}

export interface ValidationResult {
    schemaValid: boolean;
    logicValid: boolean;
    schemaErrors: unknown[];
    schemaWarnings: unknown[];
    logicErrors: string[];
}

export interface ResponseValidationResult {
    valid: boolean;
    errors: unknown[];
    missingRequired: string[];
    visibleQuestions: string[];
    hiddenQuestions: string[];
    requiredQuestions: string[];
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
    totalResponses: number;
    completedResponses: number;
    completionRate: number;
    avgCompletionTime: number;
    medianCompletionTime: number;
    responsesByStatus: Record<string, number>;
    responsesToday: number;
    responsesThisWeek: number;
    versionsIncluded?: number[];
}

export interface AnalyticsFunnel {
    total: number;
    started: number;
    inProgress: number;
    completed: number;
    abandoned: number;
    activeResponses: number;
    staleResponses: number;
    completionRate: number;
    dropOffRate: number;
    abandonmentRate: number;
}

export interface TrendDataPoint {
    date: string;
    count: number;
    completed: number;
}

export interface AnalyticsTrends {
    daily: TrendDataPoint[];
    weekly: TrendDataPoint[];
}

export interface ChoiceDistribution {
    value: string;
    label: string;
    count: number;
    percentage: number;
    isLegacy?: boolean;
    fromVersions?: number[];
}

export interface WordFrequency {
    word: string;
    count: number;
}

export interface QuestionAnalytics {
    questionId: string;
    questionType: string;
    questionTitle: string;
    totalAnswers: number;
    skipped: number;
    distribution?: ChoiceDistribution[];
    average?: number;
    median?: number;
    stdDeviation?: number;
    min?: number;
    max?: number;
    valueDistribution?: Record<string, number>;
    wordFrequency?: WordFrequency[];
    avgTextLength?: number;
    sampleSize?: number;
    recentResponses?: string[];
    trueCount?: number;
    falseCount?: number;
    isLegacy?: boolean;
    fromVersions?: number[];
}

export interface SurveyAnalytics {
    surveyId: string;
    surveyName: string;
    summary: AnalyticsSummary;
    funnel: AnalyticsFunnel;
    trends: AnalyticsTrends;
    questions: QuestionAnalytics[];
    generatedAt: string;
    appliedFilters?: {
        dateRange?: { startDate?: string; endDate?: string };
        versionMode?: string;
        versionId?: string;
        respondentIdsCount?: number;
        status?: string;
    };
}
