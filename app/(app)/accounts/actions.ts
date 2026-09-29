"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  adjustAccountBalance,
  createAccount,
  setAccountArchived,
  updateAccount,
} from "@/lib/services/accounts";
import { runAction } from "@/lib/utils/action";
import {
  accountCreateSchema,
  accountUpdateSchema,
  archiveSchema,
  balanceAdjustmentSchema,
} from "@/lib/validations/accounts";

const refresh = () => revalidatePath("/", "layout");

export async function createAccountAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const account = await createAccount(user.id, accountCreateSchema.parse(input));
    refresh();
    return { id: account.id };
  });
}

export async function updateAccountAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const account = await updateAccount(user.id, accountUpdateSchema.parse(input));
    refresh();
    return { id: account.id };
  });
}

export async function archiveAccountAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { id, archived } = archiveSchema.parse(input);
    await setAccountArchived(user.id, id, archived);
    refresh();
    return null;
  });
}

export async function adjustBalanceAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const id = await adjustAccountBalance(user.id, balanceAdjustmentSchema.parse(input));
    refresh();
    return { transactionId: id };
  });
}
