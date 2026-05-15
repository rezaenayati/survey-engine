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
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-demo-user': getDemoUser(),
      ...(init?.headers ?? {}),
    },
  });
}
