import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Echoes the inbound X-Correlation-ID back as X-Request-ID.
 * Generates a fresh UUID when no correlation ID is present.
 * Every response therefore carries a traceable request identifier.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
        const requestId =
            (req.headers['x-correlation-id'] as string | undefined) ??
            randomUUID();

        res.setHeader('X-Request-ID', requestId);
        next();
    }
}
