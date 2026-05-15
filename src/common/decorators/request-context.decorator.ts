import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../interfaces/request-context.interface';

/**
 * Extracts a lightweight request context from headers.
 * The caller's gateway sets X-User-ID after authenticating the user.
 */
export const GetContext = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): RequestContext => {
        const request = ctx.switchToHttp().getRequest<Request>();
        const headers = request.headers;

        return {
            userId: headers['x-user-id'] as string | undefined,
            correlationId:
                (headers['x-correlation-id'] as string) ||
                generateCorrelationId(),
        };
    },
);

function generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
