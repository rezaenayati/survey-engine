/**
 * Minimal request context extracted from headers.
 * Authentication and authorization are handled by the caller's gateway —
 * survey-engine receives the verified user ID as a plain header value.
 */
export interface RequestContext {
  /** Authenticated user ID (optional — anonymous requests have no user) */
  userId?: string;
  /** Correlation ID for distributed tracing */
  correlationId: string;
}

export const CONTEXT_HEADERS = {
  USER_ID: 'x-user-id',
  CORRELATION_ID: 'x-correlation-id',
} as const;
