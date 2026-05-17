/**
 * Stable, machine-readable error codes returned by the API in the `code` field.
 *
 * Code rules:
 * - Codes are part of the public API contract. Don't rename without a deprecation cycle.
 * - When a throw site has a domain-specific reason for failure, attach the matching
 *   code: `throw new NotFoundException({ code: 'SURVEY_NOT_FOUND', message: '...' })`.
 * - When no explicit code is set, `HttpExceptionFilter` falls back to a status-based
 *   code (`BAD_REQUEST`, `NOT_FOUND`, etc.).
 */
export const ErrorCodes = {
    // Resources — not-found / state issues
    SURVEY_NOT_FOUND: 'SURVEY_NOT_FOUND',
    SURVEY_ARCHIVED: 'SURVEY_ARCHIVED',
    SURVEY_NOT_PUBLISHED: 'SURVEY_NOT_PUBLISHED',
    RESPONSE_NOT_FOUND: 'RESPONSE_NOT_FOUND',
    RESPONSE_ALREADY_COMPLETED: 'RESPONSE_ALREADY_COMPLETED',
    VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',

    // Authentication / authorisation
    FORBIDDEN: 'FORBIDDEN',
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_API_KEY: 'INVALID_API_KEY',
    INVALID_USER_TOKEN: 'INVALID_USER_TOKEN',
    STRICT_AUTH_VIOLATION: 'STRICT_AUTH_VIOLATION',

    // Validation
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    INVALID_SCHEMA: 'INVALID_SCHEMA',
    INVALID_LOGIC: 'INVALID_LOGIC',
    INVALID_FILE: 'INVALID_FILE',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',

    // Service configuration
    MISCONFIGURED: 'MISCONFIGURED',

    // Generic status-based fallbacks (returned by HttpExceptionFilter when no
    // explicit code is set on the thrown exception).
    BAD_REQUEST: 'BAD_REQUEST',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    RATE_LIMITED: 'RATE_LIMITED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Fallback mapping from HTTP status to error code, used when an exception is
 * thrown without an explicit `code`.
 */
export function codeForStatus(status: number): ErrorCode {
    if (status === 400) return ErrorCodes.BAD_REQUEST;
    if (status === 401) return ErrorCodes.UNAUTHORIZED;
    if (status === 403) return ErrorCodes.FORBIDDEN;
    if (status === 404) return ErrorCodes.NOT_FOUND;
    if (status === 409) return ErrorCodes.CONFLICT;
    if (status === 422) return ErrorCodes.VALIDATION_FAILED;
    if (status === 429) return ErrorCodes.RATE_LIMITED;
    return ErrorCodes.INTERNAL_ERROR;
}
