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

    describe('without API_KEY', () => {
        beforeEach(() => {
            delete process.env.API_KEY;
        });

        it('allows any request when no API_KEY is configured', () => {
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('allows requests carrying X-User-ID without challenge', () => {
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

        it('skips the check when @SkipApiKey() is applied', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
            const guard = new ApiKeyGuard(reflector);
            const ctx = makeContext({ path: '/surveys', headers: {} });
            expect(guard.canActivate(ctx)).toBe(true);
        });
    });
});
