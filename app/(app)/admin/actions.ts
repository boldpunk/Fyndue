"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { decideProRequest, grantPro, revokePro } from "@/lib/services/billing";
import { getTelegramClient } from "@/lib/telegram/server";
import { runAction } from "@/lib/utils/action";
import { idSchema } from "@/lib/validations/common";

// requireAdmin answers non-admins with a 404; the services check again.
const refresh = () => revalidatePath("/admin");

export async function decideProRequestAction(input: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { id, approve } = z.object({ id: idSchema, approve: z.boolean() }).parse(input);
    await decideProRequest(admin.id, id, approve, getTelegramClient());
    refresh();
    return null;
  });
}

export async function grantProAction(input: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { userId, days, note } = z
      .object({ userId: idSchema, days: z.coerce.number().int().min(1).max(3660), note: z.string().trim().max(200).optional() })
      .parse(input);
    await grantPro(admin.id, userId, days, note || undefined, getTelegramClient());
    refresh();
    return null;
  });
}

export async function revokeProAction(userId: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    await revokePro(admin.id, idSchema.parse(userId));
    refresh();
    return null;
  });
}
