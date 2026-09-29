import 'server-only';

/**
 * The model behind the chat: Claude, through the Anthropic Messages API.
 * The key and the model come from the environment (env.ts).
 */

import { env } from './env';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** One part of the system prompt. A part marked `cache_control` closes a cacheable prefix. */
export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/** Raised for failures the person asking can be told about as they are. */
export class ChatError extends Error {}

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 60_000;

/** Ask Claude. Throws `ChatError` with a message fit to show when it cannot. */
export async function askModel(system: SystemBlock[], messages: ChatTurn[]): Promise<string> {
  const config = env();
  if (!config.ANTHROPIC_API_KEY) throw new ChatError('The assistant is switched off on this site.');

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.ANTHROPIC_MODEL, max_tokens: MAX_TOKENS, system, messages }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error('[chat] could not reach the model:', error);
    throw new ChatError('The assistant did not respond in time. Please try again.');
  }

  const json = (await response.json().catch(() => null)) as { error?: { message?: string; type?: string }; content?: Array<{ text?: string }> } | null;
  if (!response.ok || !json || json.error) {
    // The provider's own message can name keys, models and limits; it belongs in the log, not on the page.
    console.error('[chat] the model refused:', response.status, json?.error ?? response.statusText);
    throw new ChatError(response.status === 429 ? 'The assistant is busy. Please try again in a minute.' : 'The assistant could not answer just now. Please try again.');
  }
  return (json.content ?? []).map((block) => block.text ?? '').join('');
}
