import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { env, googleAuthEnabled } from "@/lib/env";
import { bootstrapUser } from "@/lib/services/bootstrap";

/**
 * Better Auth owns password hashing, session tokens and cookies — Fyndue
 * never stores or compares passwords itself (SPEC §42, docs/security.md §1).
 */
export const auth = betterAuth({
  appName: "Fyndue",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // The financial model is called Account; Better Auth's table is AuthAccount.
  account: { modelName: "authAccount" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    disableSignUp: !env.ALLOW_REGISTRATION,
    autoSignIn: true,
  },
  socialProviders: googleAuthEnabled
    ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
    : {},
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: env.NODE_ENV === "production",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await bootstrapUser(user.id);
        },
      },
    },
  },
  // Must be last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
