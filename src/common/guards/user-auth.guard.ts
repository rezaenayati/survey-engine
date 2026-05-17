import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserTokenError, verifyUserToken } from '../auth/user-token';
import { SKIP_API_KEY } from './api-key.guard';

/**
 * Request augmented with the verified user identity from a successful
 * `X-User-Token` verification. Downstream code reads this via `GetContext()`.
 */
export type RequestWithVerifiedUser = Request & {
    verifiedUserId?: string;
};

/**
 * User-identity guard — runs alongside {@link ApiKeyGuard}.
 *
 * Two knobs:
 *
 * - `USER_TOKEN_SECRET` (optional) — when set, an HS256-signed JWT in
 *   `X-User-Token` is verified and its `sub` claim attached to the request as
 *   `verifiedUserId`. This is the cryptographically authenticated path for
 *   forwarding user identity.
 *
 * - `STRICT_AUTH=true` (optional) — refuses claims of user identity that
 *   aren't backed by an authenticated caller:
 *     - Token mode on  → only `X-User-Token` is honored; `X-User-ID` rejected.
 *     - Token mode off → `X-User-ID` requires `API_KEY` to be configured
 *       (so the caller-auth path is active and ApiKeyGuard has run a key check).
 *
 * Health routes and handlers decorated with `@SkipApiKey()` are exempt.
 */
@Injectable()
export class UserAuthGuard implements CanActivate {
    private readonly userTokenSecret: string | undefined;
    private readonly strictAuth: boolean;
    private readonly apiKeyConfigured: boolean;

    constructor(private readonly reflector: Reflector) {
        this.userTokenSecret = process.env.USER_TOKEN_SECRET;
        this.strictAuth = process.env.STRICT_AUTH === 'true';
        this.apiKeyConfigured = !!process.env.API_KEY;
    }

    canActivate(context: ExecutionContext): boolean {
        const req = context
            .switchToHttp()
            .getRequest<RequestWithVerifiedUser>();

        if (req.path.startsWith('/health')) return true;

        const skip = this.reflector.getAllAndOverride<boolean>(SKIP_API_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skip) return true;

        const hasUserIdHeader = !!req.headers['x-user-id'];
        const tokenHeader = req.headers['x-user-token'] as string | undefined;

        // Verify token if both the secret and header are present. Invalid tokens
        // always 401 — a malformed token is never silently ignored.
        if (this.userTokenSecret && tokenHeader) {
            try {
                const verified = verifyUserToken(
                    tokenHeader,
                    this.userTokenSecret,
                );
                req.verifiedUserId = verified.userId;
            } catch (err) {
                throw new UnauthorizedException(
                    err instanceof UserTokenError
                        ? `Invalid X-User-Token (${err.code})`
                        : 'Invalid X-User-Token',
                );
            }
        }

        // Strict-auth, token mode on: bare X-User-ID is rejected.
        if (
            this.strictAuth &&
            this.userTokenSecret &&
            hasUserIdHeader &&
            !tokenHeader
        ) {
            throw new UnauthorizedException(
                'STRICT_AUTH with USER_TOKEN_SECRET set: identity must be ' +
                    'forwarded via a signed X-User-Token, not X-User-ID.',
            );
        }

        // Strict-auth, token mode off: X-User-ID requires API_KEY to be configured
        // (when it is, ApiKeyGuard has already enforced the request-time check).
        if (
            this.strictAuth &&
            !this.userTokenSecret &&
            hasUserIdHeader &&
            !this.apiKeyConfigured
        ) {
            throw new UnauthorizedException(
                'STRICT_AUTH is enabled but API_KEY is not configured; ' +
                    'X-User-ID cannot be trusted without an authenticated caller. ' +
                    'Either set API_KEY and have callers send it, or remove X-User-ID.',
            );
        }

        return true;
    }
}
