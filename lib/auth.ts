import 'server-only';

/**
 * Sessions and access.
 *
 * People sign in with Google (google-auth.ts). The session is a signed JWT in
 * an httpOnly cookie; there is no user table. What a person may do is worked
 * out afresh on every request from the Access tab, so a change there takes
 * effect within a minute.
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { FULL_ACCESS, accessFrom, todayInIndia, type Access } from './access';
import { env } from './env';
import { readAccessCached } from './sheets';
import type { SessionUser } from './types';

export const SESSION_COOKIE = 'btg_session';

const SESSION_HOURS = 12;

/** A signed-in person and what they may do. */
export interface Session {
  user: SessionUser;
  access: Access;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

/**
 * What this address may do, or null when it is not approved.
 *
 * People are listed in the Access tab of the master workbook, which the
 * dashboard's owner edits. The environment names the administrators. They
 * have full access whatever the tab says, so a mistake in the sheet cannot
 * lock everyone out.
 */
export async function accessFor(email: string): Promise<Access | null> {
  const address = email.trim().toLowerCase();
  const domain = address.split('@')[1] ?? '';
  const config = env();
  if (list(config.ALLOWED_EMAILS).includes(address) || list(config.ALLOWED_DOMAINS).includes(domain)) return FULL_ACCESS;
  try {
    const entry = (await readAccessCached()).find((e) => e.email === address);
    return entry ? accessFrom(entry, todayInIndia()) : null;
  } catch (error) {
    // When the sheet cannot be read, only the administrators get in.
    console.error('[auth] could not read the Access tab:', error);
    return null;
  }
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

/** Who is signed in on this request and what they may do, or null. Someone no longer approved counts as signed out. */
export async function currentSession(): Promise<Session | null> {
  const store = await cookies();
  const user = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!user) return null;
  const access = await accessFor(user.email);
  return access ? { user, access } : null;
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
