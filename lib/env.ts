/**
 * Server-side configuration, validated once so failures are loud and early.
 *
 * Never import this from a client component. Everything here is secret.
 */

import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z
  .object({
    /** The master workbook: Projects, Overheads, Targets. */
    GOOGLE_SHEET_ID: z.string().min(1, 'GOOGLE_SHEET_ID is required'),
    /** The pipeline workbook: Pipeline, Probability. */
    GOOGLE_PIPELINE_SHEET_ID: z.string().min(1, 'GOOGLE_PIPELINE_SHEET_ID is required'),
    /** The whole service-account JSON, either raw or base64 encoded. */
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1, 'GOOGLE_SERVICE_ACCOUNT_JSON is required'),

    /** Signs the session cookie. */
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),

    /** The Google OAuth client people sign in through. */
    GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
    GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
    /** Who may sign in: whole domains and single addresses, comma separated. */
    ALLOWED_DOMAINS: optional,
    ALLOWED_EMAILS: optional,
    /** The site's public address, e.g. https://finance.btg.studio. Required in production. */
    APP_URL: optional.pipe(z.string().url('APP_URL must be a full address such as https://finance.btg.studio').optional()),

    /** Seconds the sheet may be served from cache before being read again. */
    SHEET_REVALIDATE_SECONDS: z.coerce.number().int().nonnegative().default(60),

    /** The chat. Without a key the chat says it is switched off; the dashboard still works. */
    ANTHROPIC_API_KEY: optional,
    ANTHROPIC_MODEL: optional.pipe(z.string().default('claude-sonnet-5-5')),
    /** Questions one person may ask per hour. */
    CHAT_HOURLY_LIMIT: z.coerce.number().int().positive().default(30),

    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  })
  .superRefine((config, context) => {
    // Sign-in redirects are built from this address, so production must state it
    // rather than trust whatever host a request claims to be for.
    if (config.NODE_ENV === 'production' && !config.APP_URL) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['APP_URL'], message: 'APP_URL is required in production' });
    }
  });

let cached: z.infer<typeof schema> | null = null;

export function env(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * The service-account credentials.
 *
 * Accepts raw JSON or base64. Base64 is easier to paste into a `.env` file and
 * into Vercel, because a PEM private key is multi-line.
 */
export function serviceAccount(): ServiceAccount {
  const raw = env().GOOGLE_SERVICE_ACCOUNT_JSON.trim();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');

  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is neither valid JSON nor valid base64-encoded JSON.',
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('The service-account JSON is missing client_email or private_key.');
  }

  return {
    client_email: parsed.client_email,
    // Hosting providers often store the key with literal \n sequences.
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}
