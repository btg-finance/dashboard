import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, appOrigin, createSessionToken, isAllowed, sessionCookieOptions } from '@/lib/auth';
import { STATE_COOKIE, userFromCode } from '@/lib/google-auth';

/**
 * Where Google sends the browser back. The person is let in only if the
 * one-time value matches, Google vouches for the address, and the address is
 * on the approved list. Every refusal returns to the login page with a reason.
 */
export async function GET(request: Request) {
  const origin = appOrigin(request);
  const refuse = (reason: string) => {
    const response = NextResponse.redirect(`${origin}/login?error=${reason}`);
    response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  };

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = (await cookies()).get(STATE_COOKIE)?.value;
  if (url.searchParams.get('error')) return refuse('cancelled');
  if (!code || !state || !expected || state !== expected) return refuse('expired');

  let user;
  try {
    user = await userFromCode(request, code);
  } catch (error) {
    console.error('[auth] Google sign-in failed:', error);
    return refuse('failed');
  }
  if (!isAllowed(user.email)) return refuse('not-approved');

  const response = NextResponse.redirect(`${origin}/exec`);
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions);
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
