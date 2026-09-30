import "server-only";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { dbToLocalDate, localDateToDb } from "@/lib/finance/dates";
import type { RateRow } from "@/lib/finance/fx";
import type { ExchangeRateInput } from "@/lib/validations/planning";
import { writeAudit } from "./audit";
import { isUniqueViolation } from "./prisma-errors";

export type ExchangeRateDTO = RateRow & { id: string; rate: string };

export async function listExchangeRates(userId: string): Promise<ExchangeRateDTO[]> {
  const rows = await prisma.exchangeRate.findMany({ where: { userId }, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }] });
  return rows.map((r) => ({
    id: r.id,
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    rate: r.rate.toString(),
    effectiveDate: dbToLocalDate(r.effectiveDate),
  }));
}

export async function addExchangeRate(userId: string, input: ExchangeRateInput): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const rate = await tx.exchangeRate.create({
        data: { userId, fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, rate: input.rate, effectiveDate: localDateToDb(input.effectiveDate) },
      });
      await writeAudit(tx, {
        userId,
        action: "EXCHANGE_RATE_ADDED",
        entityType: "ExchangeRate",
        entityId: rate.id,
        metadata: { pair: `${input.fromCurrency}/${input.toCurrency}`, rate: input.rate, date: input.effectiveDate },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("You already set this rate for that date.", "DUPLICATE", { effectiveDate: "A rate for this date exists" });
    }
    throw error;
  }
}

export async function deleteExchangeRate(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.exchangeRate.deleteMany({ where: { id, userId } });
    if (result.count !== 1) throw new NotFoundError("Exchange rate");
    await writeAudit(tx, { userId, action: "EXCHANGE_RATE_DELETED", entityType: "ExchangeRate", entityId: id });
  });
}
