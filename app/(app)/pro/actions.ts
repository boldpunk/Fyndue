"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { cancelProRequest, requestPro } from "@/lib/services/billing";
import { getTelegramClient } from "@/lib/telegram/server";
import { runAction } from "@/lib/utils/action";
import { idSchema } from "@/lib/validations/common";

export async function requestProAction(period: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await requestPro(user.id, z.enum(["MONTH", "YEAR"]).parse(period), getTelegramClient());
    revalidatePath("/pro");
    return result;
  });
}

export async function cancelProRequestAction(id: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await cancelProRequest(user.id, idSchema.parse(id));
    revalidatePath("/pro");
    return null;
  });
}
