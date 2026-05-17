import { createHmac } from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserAuthGuard } from '../../../src/common/guards/user-auth.guard';

interface RequestStub {
    path: string;
    headers: Record<string, string>;
    verifiedUserId?: string;
}

function makeContext(req: RequestStub): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => undefined,
        getClass: () => undefined,
    } as unknown as ExecutionContext;
}

function b64url(input: Buffer | string): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buf
        .toString('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function mintToken(payload: Record<string, unknown>, secret: string): string {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify(payload));
    const sig = b64url(
        createHmac('sha256', secret).update(`${header}.${body}`).digest(),
    );
    return `${header}.${body}.${sig}`;
}

describe('UserAuthGuard', () => {
    const ORIGINAL_ENV = { ...process.env };
    let reflector: Reflector;

    beforeEach(() => {
        reflector = new Reflector();
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    describe('default (no STRICT_AUTH, no USER_TOKEN_SECRET)', () => {
        beforeEach(() => {
            delete process.env.STRICT_AUTH;
            delete process.env.USER_TOKEN_SECRET;
            delete process.env.API_KEY;
        });

        it('allows requests with no X-User-ID', () => {
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('allows requests carrying X-User-ID (trusted-gateway mode)', () => {
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('ignores X-User-Token when USER_TOKEN_SECRET is unset (token is unverifiable)', () => {
            const token = mintToken({ sub: 'alice' }, 'some-secret');
            const guard = new UserAuthGuard(reflector);
            const req: RequestStub = {
                path: '/surveys',
                headers: { 'x-user-token': token },
            };
            expect(guard.canActivate(makeContext(req))).toBe(true);
            expect(req.verifiedUserId).toBeUndefined();
        });
    });

    describe('with STRICT_AUTH=true and token mode off', () => {
        beforeEach(() => {
            process.env.STRICT_AUTH = 'true';
            delete process.env.USER_TOKEN_SECRET;
        });

        it('rejects X-User-ID when API_KEY is unset', () => {
            delete process.env.API_KEY;
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            });
            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('allows requests without X-User-ID when API_KEY is unset', () => {
            delete process.env.API_KEY;
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('allows X-User-ID when API_KEY is configured (ApiKeyGuard handles the runtime check)', () => {
            process.env.API_KEY = 'secret';
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('still exempts /health', () => {
            delete process.env.API_KEY;
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({
                path: '/health',
                headers: { 'x-user-id': 'alice' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('skips when @SkipApiKey() is applied', () => {
            delete process.env.API_KEY;
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });
    });

    describe('with USER_TOKEN_SECRET set (token mode, STRICT_AUTH off)', () => {
        const TOKEN_SECRET = 'unit-test-token-secret';

        beforeEach(() => {
            process.env.USER_TOKEN_SECRET = TOKEN_SECRET;
            delete process.env.STRICT_AUTH;
            delete process.env.API_KEY;
        });

        it('verifies a valid token and attaches verifiedUserId to the request', () => {
            const token = mintToken({ sub: 'alice' }, TOKEN_SECRET);
            const guard = new UserAuthGuard(reflector);
            const req: RequestStub = {
                path: '/surveys',
                headers: { 'x-user-token': token },
            };
            expect(guard.canActivate(makeContext(req))).toBe(true);
            expect(req.verifiedUserId).toBe('alice');
        });

        it('rejects an invalid token (wrong secret)', () => {
            const bad = mintToken({ sub: 'alice' }, 'wrong-secret');
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-token': bad },
            });
            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('still allows requests with no identity headers', () => {
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('still trusts X-User-ID when STRICT_AUTH is off (migration mode)', () => {
            const guard = new UserAuthGuard(reflector);
            const req: RequestStub = {
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            };
            expect(guard.canActivate(makeContext(req))).toBe(true);
            expect(req.verifiedUserId).toBeUndefined();
        });
    });

    describe('with USER_TOKEN_SECRET set and STRICT_AUTH=true', () => {
        const TOKEN_SECRET = 'unit-test-token-secret';

        beforeEach(() => {
            process.env.USER_TOKEN_SECRET = TOKEN_SECRET;
            process.env.STRICT_AUTH = 'true';
            delete process.env.API_KEY;
        });

        it('accepts a valid token', () => {
            const token = mintToken({ sub: 'alice' }, TOKEN_SECRET);
            const guard = new UserAuthGuard(reflector);
            const req: RequestStub = {
                path: '/surveys',
                headers: { 'x-user-token': token },
            };
            expect(guard.canActivate(makeContext(req))).toBe(true);
            expect(req.verifiedUserId).toBe('alice');
        });

        it('rejects a bare X-User-ID (no token)', () => {
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            });
            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('allows anonymous requests (no identity headers at all)', () => {
            const guard = new UserAuthGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });
    });
});
