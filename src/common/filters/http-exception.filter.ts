import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Maps HTTP status codes to stable machine-readable error codes.
 * Consumers can branch on `code` without parsing the `message` string.
 */
function deriveCode(status: number, message: string): string {
    // Check the message first for domain-specific codes
    const upper = message.toUpperCase().replace(/\s+/g, '_');

    if (upper.includes('SURVEY') && upper.includes('NOT_FOUND'))
        return 'SURVEY_NOT_FOUND';
    if (upper.includes('RESPONSE') && upper.includes('NOT_FOUND'))
        return 'RESPONSE_NOT_FOUND';
    if (upper.includes('VERSION') && upper.includes('NOT_FOUND'))
        return 'VERSION_NOT_FOUND';
    if (
        upper.includes('ALREADY_COMPLETED') ||
        upper.includes('ALREADY COMPLETED')
    )
        return 'RESPONSE_ALREADY_COMPLETED';
    if (upper.includes('ARCHIVED')) return 'SURVEY_ARCHIVED';
    if (
        upper.includes('NOT_PUBLISHED') ||
        upper.includes('NO PUBLISHED') ||
        upper.includes('NOT PUBLISHED')
    )
        return 'SURVEY_NOT_PUBLISHED';
    if (upper.includes('INVALID') && upper.includes('SCHEMA'))
        return 'INVALID_SCHEMA';
    if (upper.includes('INVALID') && upper.includes('LOGIC'))
        return 'INVALID_LOGIC';
    if (upper.includes('DO NOT HAVE ACCESS') || upper.includes('FORBIDDEN'))
        return 'FORBIDDEN';
    if (upper.includes('INVALID_API_KEY') || upper.includes('INVALID API KEY'))
        return 'INVALID_API_KEY';

    // Fall back to generic status-based codes
    if (status === 400) return 'BAD_REQUEST';
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 422) return 'VALIDATION_ERROR';
    if (status === 429) return 'RATE_LIMITED';
    return 'INTERNAL_ERROR';
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: HttpException, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const status = exception.getStatus();
        const raw = exception.getResponse();

        const rawObj =
            typeof raw === 'object' && raw !== null
                ? (raw as Record<string, unknown>)
                : null;
        const rawMessage = rawObj?.message;
        const message =
            typeof raw === 'string'
                ? raw
                : typeof rawMessage === 'string'
                  ? rawMessage
                  : Array.isArray(rawMessage)
                    ? (rawMessage as string[]).join('; ')
                    : exception.message;

        const errors = rawObj?.errors;

        const code = deriveCode(status, message);

        if (status >= 500) {
            this.logger.error(
                `${request.method} ${request.url} → ${status} [${code}] ${message}`,
            );
        }

        response.status(status).json({
            statusCode: status,
            code,
            message,
            ...(errors !== undefined ? { errors } : {}),
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}
