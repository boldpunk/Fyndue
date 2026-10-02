import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { findRate } from "@/lib/finance/fx";
import { latestCentralBankRates, ratesForUser, refreshCentralBankRates } from "@/lib/services/central-bank-rates";
import { addExchangeRate } from "@/lib/services/exchange-rates";
import { createUser, resetDatabase } from "../support/factories";

const payload = (date: string, usd = "11808.76") => [
  { Ccy: "USD", Nominal: "1", Rate: usd, Date: date },
  { Ccy: "EUR", Nominal: "1", Rate: "13404.12", Date: date },
  { Ccy: "RUB", Nominal: "1", Rate: "142.16", Date: date },
  { Ccy: "JPY", Nominal: "1", Rate: "80.1", Date: date },
];

function fakeFetch(body: unknown, status = 200) {
  let calls = 0;
  const impl = (async () => {
    calls++;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls: () => calls };
}

// 06:00 UTC = 11:00 in Tashkent; each test moves the clock forward so the 30-minute retry window never interferes.
let clock = new Date("2026-10-01T06:00:00Z").getTime();
const tick = () => new Date((clock += 3 * 3_600_000));

describe("Central Bank of Uzbekistan rates", () => {
  beforeEach(resetDatabase);

  it("stores today's official rates and skips once they are in", async () => {
    const now = tick();
    const today = "01.10.2026";
    const first = fakeFetch(payload(today));
    const result = await refreshCentralBankRates({ fetchImpl: first.impl, now });
    expect(result).toMatchObject({ stored: 3, latestDate: "2026-10-01" });
    expect(await prisma.centralBankRate.count()).toBe(3);

    const again = fakeFetch(payload(today));
    expect(await refreshCentralBankRates({ fetchImpl: again.impl, now: new Date(now.getTime() + 60_000) })).toMatchObject({ skipped: "up-to-date" });
    expect(again.calls()).toBe(0);

    expect(await latestCentralBankRates()).toEqual([
      { currency: "EUR", rate: "13404.12", rateDate: "2026-10-01" },
      { currency: "RUB", rate: "142.16", rateDate: "2026-10-01" },
      { currency: "USD", rate: "11808.76", rateDate: "2026-10-01" },
    ]);
  });

  it("never throws when cbu.uz is down or answers nonsense, and keeps old rates", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await refreshCentralBankRates({ fetchImpl: down, now: tick(), force: true })).toMatchObject({ stored: 0, error: "TypeError" });
    expect(await refreshCentralBankRates({ fetchImpl: fakeFetch({ error: 1 }).impl, now: tick(), force: true })).toMatchObject({ stored: 0 });
    expect(await refreshCentralBankRates({ fetchImpl: fakeFetch([], 503).impl, now: tick(), force: true })).toMatchObject({
      error: "cbu.uz answered 503",
    });
    expect(await prisma.centralBankRate.count()).toBe(0);
  });

  it("does not retry more than every 30 minutes while today's rate is missing", async () => {
    const now = tick();
    const yesterday = fakeFetch(payload("30.09.2026"));
    await refreshCentralBankRates({ fetchImpl: yesterday.impl, now });
    const soon = fakeFetch(payload("01.10.2026"));
    expect(await refreshCentralBankRates({ fetchImpl: soon.impl, now: new Date(now.getTime() + 5 * 60_000) })).toMatchObject({ skipped: "throttled" });
    expect(soon.calls()).toBe(0);
  });

  it("conversions use the official rate, and the user's own rate on the same day wins", async () => {
    const user = await createUser();
    await refreshCentralBankRates({ fetchImpl: fakeFetch(payload("01.10.2026")).impl, now: tick(), force: true });
    let rates = await ratesForUser(user.id);
    expect(findRate(rates, "USD", "UZS", "2026-10-02")).toMatchObject({ source: "CBU", effectiveDate: "2026-10-01" });
    expect(findRate(rates, "UZS", "USD", "2026-10-02")?.inverted).toBe(true);

    await addExchangeRate(user.id, { fromCurrency: "USD", toCurrency: "UZS", rate: "12000", effectiveDate: "2026-10-01" });
    rates = await ratesForUser(user.id);
    expect(findRate(rates, "USD", "UZS", "2026-10-02")).toMatchObject({ source: "MANUAL" });
    expect(findRate(rates, "USD", "UZS", "2026-10-02")?.rate.toString()).toBe("12000");

    // The next official rate replaces the older manual one.
    await refreshCentralBankRates({ fetchImpl: fakeFetch(payload("02.10.2026", "11820")).impl, now: tick(), force: true });
    rates = await ratesForUser(user.id);
    expect(findRate(rates, "USD", "UZS", "2026-10-02")).toMatchObject({ source: "CBU" });
    expect(findRate(rates, "USD", "UZS", "2026-10-02")?.rate.toString()).toBe("11820");
  });
});
