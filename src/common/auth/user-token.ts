import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Result of a successful user-token verification.
 */
export interface VerifiedUserToken {
    /** Verified user identifier (the JWT `sub` claim). */
    userId: string;
    /** Issued-at, if present in the payload (unix seconds). */
    iat?: number;
    /** Expiry, if present in the payload (unix seconds). */
    exp?: number;
}

/**
 * Reasons a token can fail verification. Surfaced in the error so callers can
 * differentiate "expired" from "bad signature" without parsing the message.
 */
export type UserTokenErrorCode =
    | 'MALFORMED'
    | 'UNSUPPORTED_ALGORITHM'
    | 'INVALID_SIGNATURE'
    | 'MISSING_SUBJECT'
    | 'EXPIRED'
    | 'NOT_YET_VALID';

export class UserTokenError extends Error {
    constructor(
        public readonly code: UserTokenErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'UserTokenError';
    }
}

const CLOCK_SKEW_SECONDS = 60;

/**
 * Verify a compact JWS / JWT with HS256.
 *
 * Accepts the three-segment `header.payload.signature` form so integrators can
 * mint tokens with any standard JWT library (e.g. `jsonwebtoken`). Only HS256
 * is supported.
 *
 * The payload must include a non-empty `sub` claim. `exp` and `iat` are
 * checked when present, with a ±60s clock-skew tolerance.
 */
export function verifyUserToken(
    token: string,
    secret: string,
): VerifiedUserToken {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new UserTokenError(
            'MALFORMED',
            'User token must have three dot-separated segments',
        );
    }

    const [headerB64, payloadB64, sigB64] = parts;

    const header = safeJsonParse<{ alg?: string }>(
        base64UrlDecode(headerB64).toString('utf8'),
        'Could not parse token header',
    );
    if (header.alg !== 'HS256') {
        throw new UserTokenError(
            'UNSUPPORTED_ALGORITHM',
            `Only HS256 is supported, got "${header.alg}"`,
        );
    }

    const signingInput = `${headerB64}.${payloadB64}`;
    const expected = createHmac('sha256', secret).update(signingInput).digest();
    const provided = base64UrlDecode(sigB64);

    if (
        expected.length !== provided.length ||
        !timingSafeEqual(expected, provided)
    ) {
        throw new UserTokenError(
            'INVALID_SIGNATURE',
            'Signature verification failed',
        );
    }

    const payload = safeJsonParse<{
        sub?: unknown;
        iat?: unknown;
        exp?: unknown;
    }>(
        base64UrlDecode(payloadB64).toString('utf8'),
        'Could not parse token payload',
    );

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new UserTokenError(
            'MISSING_SUBJECT',
            'Token payload must include a non-empty "sub" claim',
        );
    }

    const now = Math.floor(Date.now() / 1000);

    if (
        typeof payload.exp === 'number' &&
        now > payload.exp + CLOCK_SKEW_SECONDS
    ) {
        throw new UserTokenError('EXPIRED', 'Token has expired');
    }

    if (
        typeof payload.iat === 'number' &&
        payload.iat > now + CLOCK_SKEW_SECONDS
    ) {
        throw new UserTokenError(
            'NOT_YET_VALID',
            'Token "iat" claim is in the future',
        );
    }

    return {
        userId: payload.sub,
        iat: typeof payload.iat === 'number' ? payload.iat : undefined,
        exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
}

function base64UrlDecode(input: string): Buffer {
    const padLength = (4 - (input.length % 4)) % 4;
    const padded =
        input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
    return Buffer.from(padded, 'base64');
}

function safeJsonParse<T>(input: string, errorMessage: string): T {
    try {
        return JSON.parse(input) as T;
    } catch {
        throw new UserTokenError('MALFORMED', errorMessage);
    }
}
