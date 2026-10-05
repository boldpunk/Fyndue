import "server-only";
import { env } from "@/lib/env";

/** Admins are listed in ADMIN_EMAILS; phone-only accounts have placeholder emails and never match. */
export function isAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
