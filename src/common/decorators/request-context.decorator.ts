import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestContext } from '../interfaces/request-context.interface';
import { RequestWithVerifiedUser } from '../guards/user-auth.guard';
import { RequestWithCorrelation } from '../middleware/request-id.middleware';

/**
 * Extracts a lightweight request context from headers and middleware state.
 *
 * - `userId` resolution: prefers `request.verifiedUserId` (set by `UserAuthGuard`
 *   after verifying an `X-User-Token`), falls back to the `X-User-ID` header.
 * - `correlationId`: read from the request object — `RequestIdMiddleware` has
 *   already resolved it (either from the inbound `X-Correlation-ID` or a fresh
 *   UUID) and echoed it as `X-Request-ID`, so this stays in sync with what
 *   the caller sees in the response.
 */
export const GetContext = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): RequestContext => {
        const request = ctx
            .switchToHttp()
            .getRequest<RequestWithVerifiedUser & RequestWithCorrelation>();

        return {
            userId:
                request.verifiedUserId ??
                (request.headers['x-user-id'] as string | undefined),
            correlationId: request.correlationId ?? '',
        };
    },
);
