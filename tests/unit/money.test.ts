import { describe, expect, it } from "vitest";
import {
  formatMoney,
  money,
  parseMoneyInput,
  percentage,
  roundMoney,
  sumMoney,
  toMoneyString,
} from "@/lib/finance/money";

describe("money", () => {
  it("keeps SPEC amounts exact", () => {
    const original = money("163593696");
    const paid = money("49986962.63");
    expect(original.minus(paid).toFixed(2)).toBe("113606733.37");
    expect(toMoneyString(paid)).toBe("49986962.63");
  });

  it("avoids floating point drift", () => {
    expect(sumMoney(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(sumMoney(Array.from({ length: 10 }, () => "0.10")).toFixed(2)).toBe("1.00");
  });

  it("refuses fractional JS numbers", () => {
    expect(() => money(0.1)).toThrow(TypeError);
    expect(money(2_000_000).toString()).toBe("2000000");
  });

  it("rounds half up", () => {
    expect(roundMoney("2.345").toFixed(2)).toBe("2.35");
    expect(roundMoney("2.344").toFixed(2)).toBe("2.34");
    expect(roundMoney("-2.345").toFixed(2)).toBe("-2.35");
    expect(roundMoney("1234.5", 0).toFixed(0)).toBe("1235");
  });

  it("computes the car installment progress (SPEC §4)", () => {
    const pct = percentage("49986962.63", "163593696");
    expect(pct?.toDecimalPlaces(2).toFixed(2)).toBe("30.56");
    expect(money(100).minus(pct!).toDecimalPlaces(2).toFixed(2)).toBe("69.44");
  });

  it("never divides by zero", () => {
    expect(percentage("100", "0")).toBeNull();
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["3500000", "3500000"],
    ["3 500 000", "3500000"],
    ["3 500 000", "3500000"],
    ["1,234,567.89", "1234567.89"],
    ["1.234.567,89", "1234567.89"],
    ["1 234 567,89", "1234567.89"],
    ["49986962.63", "49986962.63"],
    ["1,500", "1500"],
    ["12,5", "12.5"],
    ["0.05", "0.05"],
  ])("parses %j", (input, expected) => {
    expect(parseMoneyInput(input)?.toString()).toBe(money(expected).toString());
  });

  it.each(["", "abc", "-5", "1.2.3,4,5", "1e5", "12..5", "1,23,456", ".5", "5."])("rejects %j", (input) => {
    expect(parseMoneyInput(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats like the SPEC examples", () => {
    expect(formatMoney("3500000", "UZS")).toBe("3,500,000 UZS");
    expect(formatMoney("113606733.37", "UZS")).toBe("113,606,733.37 UZS");
    expect(formatMoney("2115000.00", "UZS")).toBe("2,115,000 UZS");
  });

  it("keeps every digit of very large values", () => {
    expect(formatMoney("999999999999999999.99", "UZS", { hideCurrency: true })).toBe("999,999,999,999,999,999.99");
  });

  it("supports signs and fixed decimals", () => {
    expect(formatMoney("150000", "UZS", { signed: true })).toBe("+150,000 UZS");
    expect(formatMoney("-150000", "UZS", { signed: true })).toBe("-150,000 UZS");
    expect(formatMoney("12", "USD", { alwaysShowDecimals: true })).toBe("12.00 USD");
  });
});

describe("formatCompactMoney", () => {
  it("shortens large values for axes", async () => {
    const { formatCompactMoney } = await import("@/lib/finance/money");
    expect(formatCompactMoney("12500000")).toBe("12.5M");
    expect(formatCompactMoney("850000")).toBe("850K");
    expect(formatCompactMoney("0")).toBe("0");
    expect(formatCompactMoney("-2115000")).toBe("-2.1M");
  });
});
