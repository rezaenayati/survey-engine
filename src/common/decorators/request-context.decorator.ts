import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../interfaces/request-context.interface';
import { RequestWithVerifiedUser } from '../guards/user-auth.guard';

/**
 * Extracts a lightweight request context from headers.
 *
 * `userId` resolution order:
 *   1. `request.verifiedUserId` — set by `ApiKeyGuard` after successful
 *      verification of an `X-User-Token`. Cryptographically authenticated.
 *   2. `X-User-ID` header — trusted as-is (the caller's gateway forwarded it
 *      after authenticating the user).
 */
export const GetContext = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): RequestContext => {
        const request = ctx
            .switchToHttp()
            .getRequest<RequestWithVerifiedUser>();
        const headers = request.headers;

        return {
            userId:
                request.verifiedUserId ??
                (headers['x-user-id'] as string | undefined),
            correlationId:
                (headers['x-correlation-id'] as string) ||
                generateCorrelationId(),
        };
    },
);

function generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
