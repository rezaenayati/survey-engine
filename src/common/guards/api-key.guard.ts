import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const SKIP_API_KEY = 'skipApiKey';

/**
 * Optional API key + strict-auth guard.
 *
 * `API_KEY` (optional) — when set, every request must carry it in one of:
 *     Authorization: Bearer <key>
 *     X-API-Key: <key>
 *   Unset → guard is inactive for callers without `X-User-ID`.
 *
 * `STRICT_AUTH=true` (optional) — when set, any request that carries
 *   `X-User-ID` must also carry a valid `API_KEY`. This stops an attacker
 *   from setting `X-User-ID: <victim>` on a directly reachable engine.
 *   Without STRICT_AUTH the engine trusts `X-User-ID` as-is (default,
 *   appropriate for deployments behind a trusted gateway).
 *
 * Health check routes are always exempt.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly apiKey: string | undefined;
    private readonly strictAuth: boolean;

    constructor(private readonly reflector: Reflector) {
        this.apiKey = process.env.API_KEY;
        this.strictAuth = process.env.STRICT_AUTH === 'true';
    }

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();

        // Allow health endpoints regardless of key / strict-auth
        if (req.path.startsWith('/health')) return true;

        // Allow if the handler is explicitly decorated with @SkipApiKey()
        const skip = this.reflector.getAllAndOverride<boolean>(SKIP_API_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skip) return true;

        const hasUserIdHeader = !!req.headers['x-user-id'];

        // Strict-auth contract: claiming a user identity requires an authenticated
        // caller. If STRICT_AUTH is on, a request with X-User-ID must also pass
        // the API_KEY check — and API_KEY itself must be configured.
        if (this.strictAuth && hasUserIdHeader && !this.apiKey) {
            throw new UnauthorizedException(
                'STRICT_AUTH is enabled but API_KEY is not configured; ' +
                    'X-User-ID cannot be trusted without an authenticated caller. ' +
                    'Either set API_KEY and have callers send it, or remove X-User-ID.',
            );
        }

        // No API_KEY configured and no strict-auth violation → guard is inactive
        if (!this.apiKey) return true;

        const providedKey =
            this.extractBearerToken(req.headers['authorization']) ??
            (req.headers['x-api-key'] as string | undefined);

        if (!providedKey || providedKey !== this.apiKey) {
            throw new UnauthorizedException('Invalid or missing API key');
        }

        return true;
    }

    private extractBearerToken(header?: string): string | undefined {
        if (!header?.startsWith('Bearer ')) return undefined;
        return header.slice(7);
    }
}
