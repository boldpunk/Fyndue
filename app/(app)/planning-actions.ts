"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { copyBudgetsFromPreviousMonth, deleteBudget, setBudget } from "@/lib/services/budgets";
import { refreshCentralBankRates } from "@/lib/services/central-bank-rates";
import { addExchangeRate, deleteExchangeRate } from "@/lib/services/exchange-rates";
import { DomainError } from "@/lib/errors";
import { createRecurring, deleteRecurring, recordOccurrence, setRecurringActive, updateRecurring } from "@/lib/services/recurring";
import { runAction } from "@/lib/utils/action";
import { archiveSchema } from "@/lib/validations/accounts";
import { idSchema } from "@/lib/validations/common";
import {
  budgetSchema,
  copyBudgetsSchema,
  exchangeRateSchema,
  recordOccurrenceSchema,
  recurringSchema,
  recurringUpdateSchema,
} from "@/lib/validations/planning";

// Planning data feeds the dashboard, calendar and analytics.
const refresh = () => revalidatePath("/", "layout");

export async function saveRecurringAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const hasId = z.object({ id: idSchema }).safeParse(input).success;
    if (hasId) {
      const parsed = recurringUpdateSchema.parse(input);
      await updateRecurring(user.id, parsed.id, parsed);
      refresh();
      return { id: parsed.id };
    }
    const result = await createRecurring(user.id, recurringSchema.parse(input));
    refresh();
    return result;
  });
}

export async function setRecurringActiveAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { id, archived } = archiveSchema.parse(input);
    await setRecurringActive(user.id, id, !archived);
    refresh();
    return null;
  });
}

export async function deleteRecurringAction(id: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await deleteRecurring(user.id, idSchema.parse(id));
    refresh();
    return null;
  });
}

export async function recordOccurrenceAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await recordOccurrence(user.id, recordOccurrenceSchema.parse(input));
    refresh();
    return result;
  });
}

export async function setBudgetAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await setBudget(user.id, budgetSchema.parse(input));
    refresh();
    return null;
  });
}

export async function deleteBudgetAction(id: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await deleteBudget(user.id, idSchema.parse(id));
    refresh();
    return null;
  });
}

export async function copyBudgetsAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const copied = await copyBudgetsFromPreviousMonth(user.id, copyBudgetsSchema.parse(input));
    refresh();
    return { copied };
  });
}

export async function addExchangeRateAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await addExchangeRate(user.id, exchangeRateSchema.parse(input));
    refresh();
    return null;
  });
}

export async function deleteExchangeRateAction(id: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await deleteExchangeRate(user.id, idSchema.parse(id));
    refresh();
    return null;
  });
}

export async function refreshCentralBankRatesAction() {
  return runAction(async () => {
    await requireUser();
    const result = await refreshCentralBankRates({ force: true });
    if (result.error && !result.stored) throw new DomainError("Не удалось получить курс с cbu.uz. Попробуйте позже — пока используется последний сохранённый курс.");
    revalidatePath("/", "layout");
    return { latestDate: result.latestDate };
  });
}
