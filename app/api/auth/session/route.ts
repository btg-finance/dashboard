import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/auth';

/** Who is signed in and what they may do. Both are null when nobody is. */
export async function GET() {
  const session = await currentSession();
  return NextResponse.json({ user: session?.user ?? null, access: session?.access ?? null });
}

export const dynamic = 'force-dynamic';
