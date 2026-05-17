import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request augmented with the correlation ID resolved by `RequestIdMiddleware`.
 * Read this via `GetContext()` rather than reading the header directly so a
 * single request always has one ID — the same one echoed in `X-Request-ID`.
 */
export type RequestWithCorrelation = Request & { correlationId?: string };

/**
 * Echoes the inbound `X-Correlation-ID` back as `X-Request-ID`, falling back
 * to a freshly generated UUID. The resolved value is also attached to the
 * request object so downstream code (e.g. `GetContext()`) doesn't re-derive it.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
        const requestId =
            (req.headers['x-correlation-id'] as string | undefined) ??
            randomUUID();

        (req as RequestWithCorrelation).correlationId = requestId;
        res.setHeader('X-Request-ID', requestId);
        next();
    }
}
