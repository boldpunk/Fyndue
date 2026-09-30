import "server-only";
import { z } from "zod";

/** Empty values in .env ("") count as unset. */
const optional = (schema: z.ZodString) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ALLOW_REGISTRATION: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // Telegram (Phase 5). All optional: without a token the feature is off.
  TELEGRAM_BOT_TOKEN: optional(z.string()),
  TELEGRAM_BOT_USERNAME: optional(z.string().regex(/^[A-Za-z0-9_]{5,32}$/, "TELEGRAM_BOT_USERNAME is the bot's @username without the @")),
  TELEGRAM_WEBHOOK_SECRET: optional(z.string().regex(/^[A-Za-z0-9_-]{16,256}$/, "TELEGRAM_WEBHOOK_SECRET: 16-256 characters of A-Z a-z 0-9 _ -")),
  CRON_SECRET: optional(z.string().min(16, "CRON_SECRET must be at least 16 characters")),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const telegramEnabled = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);

export const googleAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
