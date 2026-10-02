import "server-only";
import { prisma } from "@/lib/db";
import { CBU_RATES_URL, parseCbuRates, type CbuRate } from "@/lib/finance/cbu";
import { addDays, dbToLocalDate, DEFAULT_TIMEZONE, localDateToDb, todayIn, type LocalDate } from "@/lib/finance/dates";
import type { RateRow } from "@/lib/finance/fx";
import { listExchangeRates } from "./exchange-rates";

/** Don't hit cbu.uz more often than this when the rate for today isn't out yet. */
const RETRY_AFTER_MS = 30 * 60 * 1000;
let lastAttempt = 0;

export type RefreshResult = { stored: number; latestDate: LocalDate | null; skipped?: "up-to-date" | "throttled"; error?: string };

async function latestStoredDate(): Promise<LocalDate | null> {
  const row = await prisma.centralBankRate.findFirst({ where: { currency: "USD" }, orderBy: { rateDate: "desc" }, select: { rateDate: true } });
  return row ? dbToLocalDate(row.rateDate) : null;
}

/**
 * Downloads today's official rates from the Central Bank of Uzbekistan and
 * stores the new ones. Safe to call often: it does nothing once today's rate
 * is stored, retries at most every 30 minutes otherwise, and never throws —
 * a network problem just leaves the previous rates in place.
 */
export async function refreshCentralBankRates(
  options: { fetchImpl?: typeof fetch; now?: Date; force?: boolean } = {},
): Promise<RefreshResult> {
  const { fetchImpl = fetch, now = new Date(), force = false } = options;
  const today = todayIn(DEFAULT_TIMEZONE, now);
  const latest = await latestStoredDate();
  if (!force && latest && latest >= today) return { stored: 0, latestDate: latest, skipped: "up-to-date" };
  if (!force && now.getTime() - lastAttempt < RETRY_AFTER_MS) return { stored: 0, latestDate: latest, skipped: "throttled" };
  lastAttempt = now.getTime();

  let rates: CbuRate[];
  try {
    const response = await fetchImpl(CBU_RATES_URL, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
    if (!response.ok) return { stored: 0, latestDate: latest, error: `cbu.uz answered ${response.status}` };
    rates = parseCbuRates(await response.json());
  } catch (error) {
    return { stored: 0, latestDate: latest, error: error instanceof Error ? error.name : "network error" };
  }
  if (rates.length === 0) return { stored: 0, latestDate: latest, error: "no usable rates in the response" };

  const { count } = await prisma.centralBankRate.createMany({
    data: rates.map((r) => ({ currency: r.currency, rate: r.rate, rateDate: localDateToDb(r.rateDate), fetchedAt: now })),
    skipDuplicates: true,
  });
  return { stored: count, latestDate: (await latestStoredDate()) ?? latest };
}

export type CentralBankRateDTO = { currency: string; rate: string; rateDate: LocalDate };

/** The most recent official rate per currency (UZS per 1 unit). */
export async function latestCentralBankRates(): Promise<CentralBankRateDTO[]> {
  const rows = await prisma.centralBankRate.findMany({
    where: { rateDate: { gte: localDateToDb(addDays(todayIn(DEFAULT_TIMEZONE), -45)) } },
    orderBy: [{ rateDate: "desc" }],
  });
  const seen = new Map<string, CentralBankRateDTO>();
  for (const r of rows) if (!seen.has(r.currency)) seen.set(r.currency, { currency: r.currency, rate: r.rate.toString(), rateDate: dbToLocalDate(r.rateDate) });
  return [...seen.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Rates for conversions: the user's manual rates plus recent official ones. */
export async function ratesForUser(userId: string): Promise<RateRow[]> {
  const [manual, official] = await Promise.all([
    listExchangeRates(userId),
    prisma.centralBankRate.findMany({ where: { rateDate: { gte: localDateToDb(addDays(todayIn(DEFAULT_TIMEZONE), -45)) } } }),
  ]);
  return [
    ...manual.map((r) => ({ ...r, source: "MANUAL" as const })),
    ...official.map((r) => ({ fromCurrency: r.currency, toCurrency: "UZS", rate: r.rate.toString(), effectiveDate: dbToLocalDate(r.rateDate), source: "CBU" as const })),
  ];
}

/** Today's official rate for one currency, or null. */
export function cbuRateOn(rows: RateRow[], currency: string): string | null {
  const row = rows.filter((r) => r.source === "CBU" && r.fromCurrency === currency).sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0];
  return row ? String(row.rate) : null;
}
