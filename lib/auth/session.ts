import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { auth } from "./auth";
import { isAdminEmail } from "./admin";
import { formatPhone, isPhoneAccountEmail } from "./phone";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  /** What to show for the user: the email, or the phone number for phone-only accounts. */
  contact: string;
  phoneNumber: string | null;
  image: string | null;
  baseCurrency: "UZS" | "USD" | "EUR" | "RUB";
  timezone: string;
  /** Sees the admin tab (ADMIN_EMAILS). */
  isAdmin: boolean;
};

/** Session for this request (deduplicated across the render tree). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phoneNumber: true, image: true, baseCurrency: true, timezone: true },
  });
  if (!user) return null;
  const contact = isPhoneAccountEmail(user.email) && user.phoneNumber ? formatPhone(user.phoneNumber) : user.email;
  return { ...user, contact, isAdmin: isAdminEmail(user.email) };
});

/**
 * The only way server code learns who the user is. `userId` is never taken
 * from client input (docs/security.md §2).
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Admin pages: everyone else gets a plain 404, so the page's existence is not revealed. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}
