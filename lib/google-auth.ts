import 'server-only';

/**
 * Sign in with Google.
 *
 * The standard authorisation-code flow: the browser goes to Google, comes
 * back with a code, the server swaps the code for an ID token and checks the
 * token's signature. Only name and email are requested. Whether the person
 * is approved is decided in auth.ts.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { appOrigin } from './auth';
import { env } from './env';
import type { SessionUser } from './types';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export const STATE_COOKIE = 'btg_oauth_state';
export const CALLBACK_PATH = '/api/auth/callback';

export function authorizeUrl(request: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID,
    redirect_uri: appOrigin(request) + CALLBACK_PATH,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Swap the code for an ID token and return the verified person behind it. */
export async function userFromCode(request: Request, code: string): Promise<SessionUser> {
  const config = env();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: appOrigin(request) + CALLBACK_PATH,
      grant_type: 'authorization_code',
    }),
  });
  const json = (await response.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!response.ok || !json.id_token) {
    throw new Error(json.error_description ?? json.error ?? 'Google did not return a sign-in token');
  }

  const { payload } = await jwtVerify(json.id_token, JWKS, { issuer: ISSUERS, audience: config.GOOGLE_CLIENT_ID });
  const email = typeof payload.email === 'string' ? payload.email : '';
  if (!email || payload.email_verified !== true) throw new Error('Google has not verified this email address');
  return { email, name: typeof payload.name === 'string' && payload.name ? payload.name : (email.split('@')[0] ?? email) };
}
