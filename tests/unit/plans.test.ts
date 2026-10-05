import { describe, expect, it } from "vitest";
import { extendPro, planFor } from "@/lib/billing/plans";

const now = new Date("2026-10-07T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("Fyndue Pro plan", () => {
  it("trial for 14 days after sign-up, then Free", () => {
    expect(planFor({ createdAt: daysAgo(3), proUntil: null, isAdmin: false }, now)).toMatchObject({ tier: "pro", reason: "trial", daysLeft: 11 });
    expect(planFor({ createdAt: daysAgo(15), proUntil: null, isAdmin: false }, now)).toEqual({ tier: "free", reason: null, until: null, daysLeft: null });
    // Accounts from before Pro got a trial from the launch day.
    expect(planFor({ createdAt: daysAgo(300), proUntil: null, trialEndsAt: inDays(5), isAdmin: false }, now)).toMatchObject({ tier: "pro", reason: "trial", daysLeft: 5 });
  });

  it("a paid period, expired periods, admins", () => {
    expect(planFor({ createdAt: daysAgo(100), proUntil: inDays(30), isAdmin: false }, now)).toMatchObject({ tier: "pro", reason: "paid", daysLeft: 30 });
    expect(planFor({ createdAt: daysAgo(100), proUntil: daysAgo(1), isAdmin: false }, now).tier).toBe("free");
    expect(planFor({ createdAt: daysAgo(1), proUntil: inDays(365), isAdmin: false }, now).reason).toBe("paid");
    expect(planFor({ createdAt: daysAgo(500), proUntil: null, isAdmin: true }, now)).toMatchObject({ tier: "pro", reason: "admin" });
  });

  it("extending adds to the current period, or starts now", () => {
    expect(extendPro(inDays(10), 30, now)).toEqual(inDays(40));
    expect(extendPro(daysAgo(5), 30, now)).toEqual(inDays(30));
    expect(extendPro(null, 365, now)).toEqual(inDays(365));
  });
});

describe("limit wording", () => {
  it("uses the genitive after «до»", async () => {
    const { upToText } = await import("@/lib/billing/plans");
    expect(upToText("accounts")).toBe("до 3 счетов");
    expect(upToText("goals")).toBe("до 1 цели");
    expect(upToText("debts")).toBe("до 2 долгов");
    expect(upToText("subscriptions", 21)).toBe("до 21 подписки");
  });
});
