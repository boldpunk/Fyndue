import { describe, expect, it } from "vitest";
import { parseCbuRates } from "@/lib/finance/cbu";
import { combineInBase, findRate, type RateRow } from "@/lib/finance/fx";

const sample = [
  { id: 68, Code: "840", Ccy: "USD", Nominal: "1", Rate: "11808.76", Diff: "-12.42", Date: "01.10.2026" },
  { id: 20, Code: "978", Ccy: "EUR", Nominal: "1", Rate: "13404.12", Diff: "-15.28", Date: "01.10.2026" },
  { id: 56, Code: "643", Ccy: "RUB", Nominal: "1", Rate: "142.16", Diff: "1.72", Date: "01.10.2026" },
  { id: 33, Code: "392", Ccy: "JPY", Nominal: "1", Rate: "80.10", Diff: "0", Date: "01.10.2026" },
  { id: 99, Code: "999", Ccy: "XXX", Nominal: "10", Rate: "12.5", Diff: "0", Date: "01.10.2026" },
];

describe("Central Bank of Uzbekistan rates", () => {
  it("keeps only supported currencies and reads the dd.mm.yyyy date", () => {
    expect(parseCbuRates(sample)).toEqual([
      { currency: "USD", rate: "11808.76", rateDate: "2026-10-01" },
      { currency: "EUR", rate: "13404.12", rateDate: "2026-10-01" },
      { currency: "RUB", rate: "142.16", rateDate: "2026-10-01" },
    ]);
  });

  it("divides by the nominal (rates quoted per 10 or 100 units)", () => {
    expect(parseCbuRates([{ Ccy: "RUB", Nominal: "10", Rate: "1421.6", Date: "01.10.2026" }])).toEqual([
      { currency: "RUB", rate: "142.16", rateDate: "2026-10-01" },
    ]);
  });

  it("skips malformed rows instead of guessing", () => {
    expect(
      parseCbuRates([
        { Ccy: "USD", Nominal: "1", Rate: "abc", Date: "01.10.2026" },
        { Ccy: "USD", Nominal: "0", Rate: "11800", Date: "01.10.2026" },
        { Ccy: "USD", Nominal: "1", Rate: "11800", Date: "2026-10-01" },
        { Ccy: "USD", Nominal: "1", Rate: "-5", Date: "01.10.2026" },
        null,
        "nonsense",
      ]),
    ).toEqual([]);
    expect(parseCbuRates({ error: "down" })).toEqual([]);
  });
});

describe("choosing between manual and Central Bank rates", () => {
  const cbu = (rate: string, effectiveDate: string): RateRow => ({ fromCurrency: "USD", toCurrency: "UZS", rate, effectiveDate, source: "CBU" });
  const manual = (rate: string, effectiveDate: string): RateRow => ({ fromCurrency: "USD", toCurrency: "UZS", rate, effectiveDate, source: "MANUAL" });

  it("uses the latest rate on or before the date", () => {
    const rates = [cbu("11765.21", "2026-09-15"), cbu("11808.76", "2026-10-01")];
    expect(findRate(rates, "USD", "UZS", "2026-10-02")).toMatchObject({ effectiveDate: "2026-10-01", source: "CBU" });
    expect(findRate(rates, "USD", "UZS", "2026-09-20")?.rate.toString()).toBe("11765.21");
  });

  it("a manual rate on the same day wins; a newer Central Bank rate replaces an older manual one", () => {
    expect(findRate([cbu("11808.76", "2026-10-01"), manual("12000", "2026-10-01")], "USD", "UZS", "2026-10-01")).toMatchObject({
      source: "MANUAL",
    });
    expect(findRate([manual("12000", "2026-10-01"), cbu("11808.76", "2026-10-01")], "USD", "UZS", "2026-10-01")?.rate.toString()).toBe("12000");
    expect(findRate([manual("12000", "2026-09-20"), cbu("11808.76", "2026-10-01")], "USD", "UZS", "2026-10-02")).toMatchObject({ source: "CBU" });
  });

  it("combines UZS and USD balances at the Central Bank rate", () => {
    const combined = combineInBase(
      [
        { currency: "UZS", amount: "25000000" },
        { currency: "USD", amount: "350.50" },
      ],
      "UZS",
      [cbu("11808.76", "2026-10-01")],
      "2026-10-02",
    );
    // 25,000,000 + 350.50 × 11,808.76 = 29,138,970.38
    expect(combined.total?.toFixed(2)).toBe("29138970.38");
    expect(combined.oldestRateDate).toBe("2026-10-01");
  });
});

describe("transfer suggestion at the Central Bank rate", () => {
  it("converts between any pair through UZS", async () => {
    const { convertViaUzs } = await import("@/lib/finance/fx");
    const rates = { USD: "11808.76", EUR: "13404.12" };
    expect(convertViaUzs("100", "USD", "UZS", rates)?.toFixed(2)).toBe("1180876.00");
    expect(convertViaUzs("1180876", "UZS", "USD", rates)?.toFixed(2)).toBe("100.00");
    expect(convertViaUzs("100", "EUR", "USD", rates)?.toFixed(2)).toBe("113.51");
    expect(convertViaUzs("100", "RUB", "UZS", rates)).toBeNull();
  });
});
