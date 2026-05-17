import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCodes } from '../errors/error-codes';

/**
 * Metadata key for {@link SkipApiKey}-style decorators. Read by both
 * `ApiKeyGuard` and `UserAuthGuard` — applying it to a route exempts that
 * handler from both API-key and user-identity checks.
 */
export const SKIP_API_KEY = 'skipApiKey';

/**
 * Caller-authentication guard.
 *
 * `API_KEY` (optional) — when set, every request must carry it in one of:
 *     Authorization: Bearer <key>
 *     X-API-Key: <key>
 *   Unset → guard is inactive (suitable for deployments behind a trusted internal gateway).
 *
 * User-identity verification (X-User-Token, STRICT_AUTH) lives in `UserAuthGuard`.
 *
 * Health check routes and handlers decorated with `@SkipApiKey()` are exempt.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly apiKey: string | undefined;

    constructor(private readonly reflector: Reflector) {
        this.apiKey = process.env.API_KEY;
    }

    canActivate(context: ExecutionContext): boolean {
        // No API_KEY configured → guard is inactive
        if (!this.apiKey) return true;

        const req = context.switchToHttp().getRequest<Request>();

        // Allow health endpoints regardless of key
        if (req.path.startsWith('/health')) return true;

        // Allow if the handler is explicitly decorated with @SkipApiKey()
        const skip = this.reflector.getAllAndOverride<boolean>(SKIP_API_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skip) return true;

        const providedKey =
            this.extractBearerToken(req.headers['authorization']) ??
            (req.headers['x-api-key'] as string | undefined);

        if (!providedKey || providedKey !== this.apiKey) {
            throw new UnauthorizedException({
                code: ErrorCodes.INVALID_API_KEY,
                message: 'Invalid or missing API key',
            });
        }

        return true;
    }

    private extractBearerToken(header?: string): string | undefined {
        if (!header?.startsWith('Bearer ')) return undefined;
        return header.slice(7);
    }
}
