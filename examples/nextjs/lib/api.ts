'use client';

/** Read the current demo user from the cookie set by NavBar. */
export function getDemoUser(): string {
    if (typeof document === 'undefined') return 'admin';
    const match = document.cookie.match(/(?:^|;\s*)demo_user=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : 'admin';
}

/** Set the demo user cookie (30-day expiry). */
export function setDemoUser(userId: string) {
    document.cookie = `demo_user=${encodeURIComponent(userId)}; path=/; max-age=${60 * 60 * 24 * 30}`;
}

/** fetch() wrapper that attaches the demo user header automatically. */
export async function apiFetch(
    url: string,
    init?: RequestInit,
): Promise<Response> {
    const isFormData =
        typeof FormData !== 'undefined' && init?.body instanceof FormData;

    const headers: Record<string, string> = {
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
        'x-demo-user': getDemoUser(),
        ...(init?.headers as Record<string, string> | undefined),
    };

    return fetch(url, {
        ...init,
        headers,
    });
}

/** Read `body[key]` when the JSON value is a string (safe parsing for error messages / ids). */
export function jsonStringField(
    body: unknown,
    key: string,
): string | undefined {
    if (typeof body !== 'object' || body === null || !(key in body)) {
        return undefined;
    }
    const v = (body as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
}
