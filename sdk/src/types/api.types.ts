import type { SurveySchema, LogicSchema } from './schema.types';

// ─── Enums ───────────────────────────────────────────────────────────────────

export type SurveyStatus = 'draft' | 'published' | 'archived';
export type ResponseStatus = 'started' | 'in_progress' | 'completed' | 'abandoned';

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

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ListResponsesQuery extends PaginationQuery {
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
