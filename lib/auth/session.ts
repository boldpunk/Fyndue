import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  baseCurrency: "UZS" | "USD" | "EUR" | "RUB";
  timezone: string;
};

/** Session for this request (deduplicated across the render tree). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, baseCurrency: true, timezone: true },
  });
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
