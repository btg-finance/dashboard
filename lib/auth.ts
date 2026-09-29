import 'server-only';

/**
 * Sessions and access.
 *
 * People sign in with Google (google-auth.ts). The session is a signed JWT in
 * an httpOnly cookie; there is no user table. The approved list is checked on
 * every request, so removing someone from it ends their access at once.
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from './env';
import type { SessionUser } from './types';

export const SESSION_COOKIE = 'btg_session';

const SESSION_HOURS = 12;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

/** True when the address is approved, by its domain or by name. */
export function isAllowed(email: string): boolean {
  const address = email.trim().toLowerCase();
  const domain = address.split('@')[1] ?? '';
  const config = env();
  return list(config.ALLOWED_EMAILS).includes(address) || list(config.ALLOWED_DOMAINS).includes(domain);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

/** The session inside a token, or null when it is missing, altered or expired. */
export async function readSessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const email = typeof payload.email === 'string' ? payload.email : null;
    if (!email) return null;
    return { email, name: typeof payload.name === 'string' ? payload.name : email };
  } catch {
    return null;
  }
}

/** The signed-in user for this request, or null. Someone no longer approved counts as signed out. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const user = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  return user && isAllowed(user.email) ? user : null;
}

/** The site's own address: the configured one, else the one this request was served on. */
export function appOrigin(request: Request): string {
  return env().APP_URL?.replace(/\/+$/, '') ?? new URL(request.url).origin;
}

/**
 * True when a state-changing request was sent by the site's own pages.
 * Browsers attach `Origin` to every POST, so a missing or foreign one is refused.
 */
export function isSameOrigin(request: Request): boolean {
  return request.headers.get('origin') === appOrigin(request);
}

export const sessionCookieOptions = {
  httpOnly: true,
  // Front end and API share an origin here, so Lax is both sufficient and safer.
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_HOURS * 60 * 60,
} as const;
