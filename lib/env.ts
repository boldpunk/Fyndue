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
  /** New accounts by phone number (code delivered by the Telegram bot). Email sign-up stays behind ALLOW_REGISTRATION. */
  ALLOW_PHONE_SIGNUP: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** Comma-separated emails that see the admin tab (/admin). */
  ADMIN_EMAILS: z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().transform((v) => v.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ),
  /** Shown on /pro: how to pay for Pro by hand (card number, recipient). Lines separated by "|". */
  PRO_PAYMENT_DETAILS: optional(z.string().max(500)),
  /** Where to write about Pro (e.g. https://t.me/boldpunk). */
  PRO_CONTACT_URL: optional(z.string().regex(/^https:\/\//, "PRO_CONTACT_URL must start with https://")),
  // Telegram (Phase 5). All optional: without a token the feature is off.
  TELEGRAM_BOT_TOKEN: optional(z.string()),
  TELEGRAM_BOT_USERNAME: optional(z.string().regex(/^[A-Za-z0-9_]{5,32}$/, "TELEGRAM_BOT_USERNAME is the bot's @username without the @")),
  TELEGRAM_WEBHOOK_SECRET: optional(z.string().regex(/^[A-Za-z0-9_-]{16,256}$/, "TELEGRAM_WEBHOOK_SECRET: 16-256 characters of A-Z a-z 0-9 _ -")),
  // Documents (Phase 6): private directory for uploaded files, outside public/.
  STORAGE_DIR: z.preprocess((v) => (v === "" ? undefined : v), z.string().default(".local/storage")),
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
/** Sign-in by phone needs the bot to deliver codes. */
export const phoneAuthEnabled = telegramEnabled;

export const googleAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
