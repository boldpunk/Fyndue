"use server";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createIngestToken, revokeIngestToken } from "@/lib/services/ingest-link";
import { runAction } from "@/lib/utils/action";

/** A new personal link (the old one stops working). Shown once. */
export async function createIngestLinkAction() {
  return runAction(async () => {
    const user = await requireUser();
    const token = await createIngestToken(user.id);
    return { url: `${env.BETTER_AUTH_URL}/api/ingest/${token}` };
  });
}

export async function revokeIngestLinkAction() {
  return runAction(async () => {
    const user = await requireUser();
    await revokeIngestToken(user.id);
    return null;
  });
}
