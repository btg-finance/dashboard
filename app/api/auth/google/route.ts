import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { STATE_COOKIE, authorizeUrl } from '@/lib/google-auth';

/** Start of Google sign-in: remember a one-time value, then hand over to Google. */
export async function GET(request: Request) {
  const state = randomBytes(24).toString('hex');
  const response = NextResponse.redirect(authorizeUrl(request, state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return response;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
