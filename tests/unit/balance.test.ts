import { describe, expect, it } from "vitest";
import { adjustmentFor, balanceEffect, computeBalance, totalsByCurrency } from "@/lib/finance/balance";

describe("account balance engine", () => {
  it("applies inflows and outflows", () => {
    const balance = computeBalance("1000000.00", [
      { direction: "INFLOW", amount: "5000000" },
      { direction: "OUTFLOW", amount: "150000.50" },
      { direction: "OUTFLOW", amount: "2115000" }, // debt payment incl. processing fee
    ]);
    expect(balance.toFixed(2)).toBe("3734999.50");
  });

  it("ignores voided and expected transactions", () => {
    expect(balanceEffect({ direction: "INFLOW", amount: "100", status: "EXPECTED" }).isZero()).toBe(true);
    expect(balanceEffect({ direction: "OUTFLOW", amount: "100", voided: true }).isZero()).toBe(true);
    expect(computeBalance("0", [{ direction: "INFLOW", amount: "100", status: "EXPECTED" }]).toFixed(2)).toBe("0.00");
  });

  it("never mixes currencies in totals", () => {
    const totals = totalsByCurrency([
      { currency: "UZS", currentBalance: "1000", includeInTotal: true, isArchived: false },
      { currency: "UZS", currentBalance: "250.50", includeInTotal: true, isArchived: false },
      { currency: "USD", currentBalance: "100", includeInTotal: true, isArchived: false },
      { currency: "UZS", currentBalance: "999", includeInTotal: false, isArchived: false },
      { currency: "UZS", currentBalance: "999", includeInTotal: true, isArchived: true },
    ]);
    expect(totals.get("UZS")?.toFixed(2)).toBe("1250.50");
    expect(totals.get("USD")?.toFixed(2)).toBe("100.00");
    expect(totals.size).toBe(2);
  });

  it("derives balance adjustments", () => {
    expect(adjustmentFor("100", "150")).toMatchObject({ direction: "INFLOW" });
    expect(adjustmentFor("100", "150")?.amount.toString()).toBe("50");
    expect(adjustmentFor("100", "40.5")?.amount.toString()).toBe("59.5");
    expect(adjustmentFor("100", "40.5")?.direction).toBe("OUTFLOW");
    expect(adjustmentFor("100", "100.00")).toBeNull();
  });
});
