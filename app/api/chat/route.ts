import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ChatError, askModel } from '@/lib/ai';
import { currentSession, isSameOrigin } from '@/lib/auth';
import { buildContext, buildViewing } from '@/lib/chat-context';
import { systemPrompt } from '@/lib/chat-prompt';
import { env } from '@/lib/env';
import { buildModel } from '@/lib/model';
import { rateLimiter, type RateLimiter } from '@/lib/rate-limit';
import { readSheetCached } from '@/lib/sheets';

/**
 * The chat. The page sends the question, the recent turns and what it is
 * showing; the figures themselves are read from the sheets here, so the
 * assistant never works from numbers a browser supplied. The API key stays
 * on the server.
 */

const MAX_TURNS = 10;
const MAX_TURN_CHARS = 4000;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }))
    .min(1)
    .refine((turns) => turns[turns.length - 1]?.role === 'user', 'The last message must be a question'),
  view: z.object({
    fy: z.number().int().min(2000).max(2100),
    period: z.enum(['all', 'h1', 'h2', 'q1', 'q2', 'q3', 'q4']),
    page: z.string().max(40),
  }),
});

let limiter: RateLimiter | null = null;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Request refused' }, { status: 403 });
  }
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 });
  }
  if (!session.access.chat) {
    return NextResponse.json({ error: 'The assistant is not part of your access.' }, { status: 403 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  limiter ??= rateLimiter(env().CHAT_HOURLY_LIMIT, 60 * 60 * 1000);
  if (!limiter.take(session.user.email)) {
    return NextResponse.json({ error: 'You have reached this hour’s limit of questions. Please try again later.' }, { status: 429 });
  }

  const { messages, view } = body.data;
  // The conversation must open with a question, so an odd leading answer is dropped after trimming.
  const recent = messages.slice(-MAX_TURNS).map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_TURN_CHARS) }));
  const turns = recent[0]?.role === 'assistant' ? recent.slice(1) : recent;

  try {
    const model = buildModel(await readSheetCached());
    const text = await askModel(systemPrompt(buildContext(model), buildViewing(view.fy, view.period, view.page)), turns);
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.message }, { status: 502 });
    console.error('[chat] failed:', error);
    return NextResponse.json({ error: 'The assistant could not answer just now. Please try again.' }, { status: 502 });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
