import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';

/** Who is signed in. */
export async function GET() {
  return NextResponse.json({ user: await currentUser() });
}

export const dynamic = 'force-dynamic';
