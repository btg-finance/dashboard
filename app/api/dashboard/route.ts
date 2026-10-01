import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth';
import { describeSheetError, readSheetCached } from '@/lib/sheets';

/** The whole dashboard payload: every record the pages compute from. */
export async function GET() {
  if (!(await currentSession())) {
    return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 });
  }

  try {
    return NextResponse.json(await readSheetCached());
  } catch (error) {
    // Surface the configuration problem rather than a bare 500, because every
    // realistic cause here is a setting someone can correct.
    const message = error instanceof Error && /Invalid environment/.test(error.message) ? error.message : describeSheetError(error);
    console.error('[dashboard] sheet read failed:', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// The session cookie makes every response user-specific, and the sheet read
// needs Node APIs rather than the edge runtime.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
