"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  confirmExpectedIncome,
  createTransaction,
  updateCashFlowTransaction,
  updateTransfer,
  voidTransaction,
} from "@/lib/services/transactions";
import { runAction } from "@/lib/utils/action";
import { idSchema } from "@/lib/validations/common";
import {
  cashFlowUpdateSchema,
  transactionCreateSchema,
  transferUpdateSchema,
  voidTransactionSchema,
} from "@/lib/validations/transactions";

// Balances appear across the whole app shell, so refresh everything.
const refresh = () => revalidatePath("/", "layout");

export async function createTransactionAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await createTransaction(user.id, transactionCreateSchema.parse(input));
    refresh();
    return result;
  });
}

export async function updateCashFlowTransactionAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateCashFlowTransaction(user.id, cashFlowUpdateSchema.parse(input));
    refresh();
    return null;
  });
}

export async function updateTransferAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateTransfer(user.id, transferUpdateSchema.parse(input));
    refresh();
    return null;
  });
}

export async function voidTransactionAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { id, reason } = voidTransactionSchema.parse(input);
    await voidTransaction(user.id, id, reason);
    refresh();
    return null;
  });
}

export async function confirmIncomeAction(id: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await confirmExpectedIncome(user.id, idSchema.parse(id));
    refresh();
    return null;
  });
}
