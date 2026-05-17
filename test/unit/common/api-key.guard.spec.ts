import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from '../../../src/common/guards/api-key.guard';

interface RequestStub {
    path: string;
    headers: Record<string, string>;
}

function makeContext(req: RequestStub): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => undefined,
        getClass: () => undefined,
    } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
    const ORIGINAL_ENV = { ...process.env };
    let reflector: Reflector;

    beforeEach(() => {
        reflector = new Reflector();
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    describe('without API_KEY and without STRICT_AUTH (default)', () => {
        beforeEach(() => {
            delete process.env.API_KEY;
            delete process.env.STRICT_AUTH;
        });

        it('allows requests with no X-User-ID', () => {
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('allows requests carrying X-User-ID (trusted-gateway mode)', () => {
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });
    });

    describe('with API_KEY set', () => {
        beforeEach(() => {
            process.env.API_KEY = 'secret';
            delete process.env.STRICT_AUTH;
        });

        it('rejects requests without a key', () => {
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('accepts X-API-Key header', () => {
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-api-key': 'secret' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('accepts Authorization: Bearer header', () => {
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { authorization: 'Bearer secret' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('rejects a wrong key', () => {
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-api-key': 'nope' },
            });
            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('always allows /health regardless of key', () => {
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({ path: '/health', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });
    });

    describe('with STRICT_AUTH=true', () => {
        beforeEach(() => {
            process.env.STRICT_AUTH = 'true';
        });

        it('rejects X-User-ID when API_KEY is unset', () => {
            delete process.env.API_KEY;
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            });
            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('still allows requests without X-User-ID when API_KEY is unset', () => {
            delete process.env.API_KEY;
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('requires both API_KEY and X-User-ID to be present together', () => {
            process.env.API_KEY = 'secret';
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice', 'x-api-key': 'secret' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('rejects X-User-ID when API_KEY is set but missing from request', () => {
            process.env.API_KEY = 'secret';
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({
                path: '/surveys',
                headers: { 'x-user-id': 'alice' },
            });
            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('still exempts /health', () => {
            delete process.env.API_KEY;
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({
                path: '/health',
                headers: { 'x-user-id': 'alice' },
            });
            expect(guard.canActivate(ctx)).toBe(true);
        });
    });
});
