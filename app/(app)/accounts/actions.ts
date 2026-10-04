"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  adjustAccountBalance,
  createAccount,
  setAccountArchived,
  updateAccount,
} from "@/lib/services/accounts";
import { adjustBalanceByTransfer, restartAccountTracking } from "@/lib/services/transactions";
import { runAction } from "@/lib/utils/action";
import {
  accountCreateSchema,
  accountUpdateSchema,
  archiveSchema,
  balanceAdjustmentSchema,
  restartTrackingSchema,
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
    const parsed = balanceAdjustmentSchema.parse(input);
    const id = parsed.counterpartAccountId
      ? await adjustBalanceByTransfer(user.id, { ...parsed, counterpartAccountId: parsed.counterpartAccountId })
      : await adjustAccountBalance(user.id, parsed);
    refresh();
    return { transactionId: id };
  });
}

export async function restartTrackingAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await restartAccountTracking(user.id, restartTrackingSchema.parse(input));
    refresh();
    return result;
  });
}
