import { NextResponse } from 'next/server';
import { SESSION_COOKIE, isSameOrigin, sessionCookieOptions } from '@/lib/auth';

/** Sign out. Refused unless sent by the site's own pages, so another site cannot sign someone out. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Request refused' }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return response;
}

export const dynamic = 'force-dynamic';
