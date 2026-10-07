"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { previewEarlyRepayment, recordDebtPayment, recordEarlyRepayment, reverseDebtPayment, lockOwnedDebt } from "@/lib/services/debt-payments";
import { replaceOpenSchedule } from "@/lib/services/debt-schedule";
import { createDebt, recordDebtDisbursement, setDebtArchived, setDebtWeekendShift, updateDebtDetails } from "@/lib/services/debts";
import { runAction } from "@/lib/utils/action";
import { archiveSchema } from "@/lib/validations/accounts";
import {
  debtDisbursementSchema,
  debtCreateSchema,
  debtUpdateSchema,
  earlyRepaymentPreviewSchema,
  earlyRepaymentSchema,
  recordPaymentSchema,
  replaceScheduleSchema,
  reversePaymentSchema,
  weekendShiftSchema,
} from "@/lib/validations/debts";

// Debt changes move balances and dashboard numbers everywhere.
const refresh = () => revalidatePath("/", "layout");

export async function createDebtAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await createDebt(user.id, debtCreateSchema.parse(input));
    refresh();
    return result;
  });
}

export async function updateDebtAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateDebtDetails(user.id, debtUpdateSchema.parse(input));
    refresh();
    return null;
  });
}

export async function archiveDebtAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { id, archived } = archiveSchema.parse(input);
    await setDebtArchived(user.id, id, archived);
    refresh();
    return null;
  });
}

export async function recordPaymentAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await recordDebtPayment(user.id, recordPaymentSchema.parse(input));
    refresh();
    return result;
  });
}

export async function previewEarlyRepaymentAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    return previewEarlyRepayment(user.id, earlyRepaymentPreviewSchema.parse(input));
  });
}

export async function earlyRepaymentAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await recordEarlyRepayment(user.id, earlyRepaymentSchema.parse(input));
    refresh();
    return result;
  });
}

export async function reversePaymentAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await reverseDebtPayment(user.id, reversePaymentSchema.parse(input));
    refresh();
    return null;
  });
}

export async function replaceScheduleAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = replaceScheduleSchema.parse(input);
    await prisma.$transaction(async (tx) => {
      const debt = await lockOwnedDebt(tx, user.id, parsed.debtId);
      await replaceOpenSchedule(tx, debt, parsed);
    });
    refresh();
    return null;
  });
}

export async function setDebtWeekendShiftAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await setDebtWeekendShift(user.id, weekendShiftSchema.parse(input));
    refresh();
    return result;
  });
}

/** «Деньги по займу поступили на счёт», recorded after the debt was created. */
export async function recordDebtDisbursementAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await recordDebtDisbursement(user.id, debtDisbursementSchema.parse(input));
    refresh();
    return null;
  });
}
