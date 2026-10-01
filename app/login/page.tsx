'use client';

/**
 * Sign in with Google. Access is limited to the approved list, which the
 * server checks after Google confirms who the person is.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { homeFor } from '@/lib/access';
import { useSession } from '@/lib/use-dashboard';

/** Why Google sign-in sent the person back here, in plain words. */
const REASONS: Record<string, string> = {
  'not-approved': 'That Google account is not on the approved list for this dashboard. Ask the dashboard owner to add you.',
  cancelled: 'Sign-in was cancelled.',
  expired: 'That sign-in attempt expired. Please try again.',
  failed: 'Google could not complete the sign-in. Please try again.',
};

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);

  // Google sends refusals back as ?error=…; read it after mount.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error');
    if (reason) setError(REASONS[reason] ?? 'Could not sign in. Please try again.');
  }, []);

  // Already signed in: go straight to the first page this person may open.
  useEffect(() => {
    const access = session.data?.access;
    if (session.data?.user && access) router.replace(homeFor(access) ?? '/exec');
  }, [session.data, router]);

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="brand" style={{ marginBottom: 22 }}>
          <span className="brand-mark">
            btg<span>.</span>
          </span>
          <span className="brand-sub">Finance</span>
        </div>
        <div className="card">
          <div className="login-title">Sign in</div>
          <div className="login-note">Use your work Google account. Access is limited to approved people.</div>
          {error ? <div className="banner bad">{error}</div> : null}
          <a className="hbtn login-google" href="/api/auth/google">
            <GoogleMark /> Sign in with Google
          </a>
        </div>
      </div>
    </div>
  );
}
