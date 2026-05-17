import { createHmac } from 'crypto';
import {
    UserTokenError,
    verifyUserToken,
} from '../../../src/common/auth/user-token';

const SECRET = 'test-secret-please-change';

function b64url(input: Buffer | string): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buf
        .toString('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function mintToken(
    payload: Record<string, unknown>,
    options: { secret?: string; alg?: string } = {},
): string {
    const secret = options.secret ?? SECRET;
    const header = b64url(
        JSON.stringify({ alg: options.alg ?? 'HS256', typ: 'JWT' }),
    );
    const body = b64url(JSON.stringify(payload));
    const signingInput = `${header}.${body}`;
    const sig = b64url(
        createHmac('sha256', secret).update(signingInput).digest(),
    );
    return `${signingInput}.${sig}`;
}

describe('verifyUserToken', () => {
    it('accepts a well-formed token and returns the sub claim', () => {
        const token = mintToken({ sub: 'alice', iat: 1000, exp: 9999999999 });
        const result = verifyUserToken(token, SECRET);
        expect(result.userId).toBe('alice');
        expect(result.iat).toBe(1000);
        expect(result.exp).toBe(9999999999);
    });

    it('accepts a token with no exp claim', () => {
        const token = mintToken({ sub: 'bob' });
        const result = verifyUserToken(token, SECRET);
        expect(result.userId).toBe('bob');
        expect(result.exp).toBeUndefined();
    });

    describe('signature checks', () => {
        it('rejects a token signed with a different secret', () => {
            const token = mintToken(
                { sub: 'alice' },
                { secret: 'wrong-secret' },
            );
            expect(() => verifyUserToken(token, SECRET)).toThrow(
                expect.objectContaining({ code: 'INVALID_SIGNATURE' }),
            );
        });

        it('rejects a tampered payload', () => {
            const token = mintToken({ sub: 'alice' });
            const [h, , s] = token.split('.');
            const tampered = `${h}.${b64url(JSON.stringify({ sub: 'eve' }))}.${s}`;
            expect(() => verifyUserToken(tampered, SECRET)).toThrow(
                expect.objectContaining({ code: 'INVALID_SIGNATURE' }),
            );
        });

        it('rejects a token with a truncated signature (no length crash)', () => {
            const token = mintToken({ sub: 'alice' });
            const [h, p] = token.split('.');
            const truncated = `${h}.${p}.${b64url('short')}`;
            expect(() => verifyUserToken(truncated, SECRET)).toThrow(
                expect.objectContaining({ code: 'INVALID_SIGNATURE' }),
            );
        });
    });

    describe('payload validation', () => {
        it('rejects an expired token (outside clock skew)', () => {
            const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
            const token = mintToken({ sub: 'alice', exp: oneHourAgo });
            expect(() => verifyUserToken(token, SECRET)).toThrow(
                expect.objectContaining({ code: 'EXPIRED' }),
            );
        });

        it('allows an exp within the ±60s clock-skew window', () => {
            const justExpired = Math.floor(Date.now() / 1000) - 10;
            const token = mintToken({ sub: 'alice', exp: justExpired });
            const result = verifyUserToken(token, SECRET);
            expect(result.userId).toBe('alice');
        });

        it('rejects a token whose iat is far in the future', () => {
            const inAnHour = Math.floor(Date.now() / 1000) + 3600;
            const token = mintToken({ sub: 'alice', iat: inAnHour });
            expect(() => verifyUserToken(token, SECRET)).toThrow(
                expect.objectContaining({ code: 'NOT_YET_VALID' }),
            );
        });

        it('rejects a token missing the sub claim', () => {
            const token = mintToken({ iat: 1000 });
            expect(() => verifyUserToken(token, SECRET)).toThrow(
                expect.objectContaining({ code: 'MISSING_SUBJECT' }),
            );
        });

        it('rejects an empty-string sub claim', () => {
            const token = mintToken({ sub: '' });
            expect(() => verifyUserToken(token, SECRET)).toThrow(
                expect.objectContaining({ code: 'MISSING_SUBJECT' }),
            );
        });
    });

    describe('header validation', () => {
        it('rejects non-HS256 algorithms', () => {
            const token = mintToken({ sub: 'alice' }, { alg: 'none' });
            expect(() => verifyUserToken(token, SECRET)).toThrow(
                expect.objectContaining({ code: 'UNSUPPORTED_ALGORITHM' }),
            );
        });

        it('rejects malformed token (not three segments)', () => {
            expect(() => verifyUserToken('not.a.valid.token', SECRET)).toThrow(
                expect.objectContaining({ code: 'MALFORMED' }),
            );
            expect(() => verifyUserToken('only-one-segment', SECRET)).toThrow(
                expect.objectContaining({ code: 'MALFORMED' }),
            );
        });

        it('rejects unparseable header JSON', () => {
            const token = `${b64url('not-json')}.${b64url(
                JSON.stringify({ sub: 'alice' }),
            )}.${b64url('sig')}`;
            expect(() => verifyUserToken(token, SECRET)).toThrow(
                UserTokenError,
            );
        });
    });
});
