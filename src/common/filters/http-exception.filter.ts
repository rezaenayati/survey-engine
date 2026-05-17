import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { codeForStatus, ErrorCode } from '../errors/error-codes';

/**
 * Maps thrown `HttpException`s to the public JSON error shape.
 *
 * The `code` field comes from the exception's response payload when set
 * (`throw new NotFoundException({ code: 'SURVEY_NOT_FOUND', message: ... })`).
 * Otherwise it falls back to a status-derived generic (`NOT_FOUND` etc.).
 */
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

        // Explicit code from the throw site wins; otherwise derive from status.
        const code: ErrorCode =
            typeof rawObj?.code === 'string'
                ? (rawObj.code as ErrorCode)
                : codeForStatus(status);

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
