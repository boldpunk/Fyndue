"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { createSharedTransaction, removeShare, shareAccount, voidSharedTransaction } from "@/lib/services/shared-accounts";
import { getTelegramClient } from "@/lib/telegram/server";
import { runAction } from "@/lib/utils/action";
import { idSchema } from "@/lib/validations/common";
import { transactionCreateSchema } from "@/lib/validations/transactions";

const refresh = () => revalidatePath("/", "layout");

export async function shareAccountAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = z.object({ accountId: idSchema, contact: z.string().trim().min(3, "Введите номер или email").max(120) }).parse(input);
    const result = await shareAccount(user.id, parsed, getTelegramClient());
    refresh();
    return result;
  });
}

export async function removeShareAction(shareId: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await removeShare(user.id, idSchema.parse(shareId));
    refresh();
    return null;
  });
}

/** A member adds an expense or income to an account shared with them. */
export async function createSharedTransactionAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = transactionCreateSchema.parse(input);
    if (parsed.kind === "TRANSFER") throw new DomainError("На общем счёте можно добавлять расходы и доходы.");
    const result = await createSharedTransaction(user.id, parsed, getTelegramClient());
    refresh();
    return result;
  });
}

export async function voidSharedTransactionAction(id: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await voidSharedTransaction(user.id, idSchema.parse(id));
    refresh();
    return null;
  });
}
