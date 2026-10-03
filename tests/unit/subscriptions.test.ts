import { describe, expect, it } from "vitest";
import { subscriptionAvatar } from "@/lib/constants/subscriptions";
import type { RateRow } from "@/lib/finance/fx";
import { formatDaysFromToday } from "@/lib/finance/recurrence";
import { annualEquivalent, sortSubscriptions, summarizeSubscriptions, type SubscriptionLike } from "@/lib/finance/subscriptions";
import { webUrlSchema } from "@/lib/validations/planning";

const sub = (over: Partial<SubscriptionLike> & Pick<SubscriptionLike, "name" | "amount" | "currency">): SubscriptionLike => ({
  id: over.name,
  frequency: "MONTHLY",
  interval: 1,
  isActive: true,
  nextOccurrence: "2026-10-15",
  ...over,
});
const cbu: RateRow[] = [{ fromCurrency: "USD", toCurrency: "UZS", rate: "11808.76", effectiveDate: "2026-10-01", source: "CBU" }];

describe("subscription cost per year", () => {
  it("monthly × 12, yearly as is, weekly × 52, divided by the interval", () => {
    expect(annualEquivalent("20", "MONTHLY", 1).toFixed(2)).toBe("240.00");
    expect(annualEquivalent("150000", "YEARLY", 1).toFixed(2)).toBe("150000.00");
    expect(annualEquivalent("30", "YEARLY", 2).toFixed(2)).toBe("15.00");
    expect(annualEquivalent("10", "WEEKLY", 1).toFixed(2)).toBe("520.00");
    expect(annualEquivalent("60", "MONTHLY", 3).toFixed(2)).toBe("240.00");
  });
});

describe("subscription summary", () => {
  const items = [
    sub({ name: "ChatGPT Plus", amount: "20", currency: "USD", nextOccurrence: "2026-10-05" }),
    sub({ name: "Claude Pro", amount: "20", currency: "USD", nextOccurrence: "2026-10-05" }),
    sub({ name: "Домен", amount: "120000", currency: "UZS", frequency: "YEARLY", nextOccurrence: "2027-03-01" }),
    sub({ name: "Spotify", amount: "5.99", currency: "USD", isActive: false, nextOccurrence: null }),
  ];

  it("totals active subscriptions per currency, month and year", () => {
    const s = summarizeSubscriptions(items, "UZS", cbu, "2026-10-03");
    expect(s.activeCount).toBe(3);
    expect(s.byCurrency).toEqual([
      { currency: "UZS", monthly: "10000.00", yearly: "120000.00" },
      { currency: "USD", monthly: "40.00", yearly: "480.00" },
    ]);
  });

  it("combines currencies at the Central Bank rate", () => {
    const s = summarizeSubscriptions(items, "UZS", cbu, "2026-10-03");
    // 40 × 11 808.76 + 10 000 = 482 350.40 a month
    expect(s.combined).toEqual({ monthly: "482350.40", yearly: "5788204.80", rateDate: "2026-10-01" });
  });

  it("has no combined total without a rate, and none for an empty list", () => {
    expect(summarizeSubscriptions(items, "UZS", [], "2026-10-03").combined).toBeNull();
    expect(summarizeSubscriptions([], "UZS", cbu, "2026-10-03")).toEqual({ activeCount: 0, byCurrency: [], combined: null, next: null });
  });

  it("names every charge on the soonest date", () => {
    expect(summarizeSubscriptions(items, "UZS", cbu, "2026-10-03").next).toEqual({
      date: "2026-10-05",
      items: [
        { id: "ChatGPT Plus", name: "ChatGPT Plus", amount: "20.00", currency: "USD" },
        { id: "Claude Pro", name: "Claude Pro", amount: "20.00", currency: "USD" },
      ],
    });
  });

  it("sorts active by next charge, paused last", () => {
    expect(sortSubscriptions(items).map((i) => i.name)).toEqual(["ChatGPT Plus", "Claude Pro", "Домен", "Spotify"]);
  });
});

describe("subscription link", () => {
  const parse = (v: string | undefined) => webUrlSchema.safeParse(v);

  it("adds https:// to a bare domain and keeps full links", () => {
    expect(parse("chatgpt.com").data).toBe("https://chatgpt.com");
    expect(parse(" https://claude.ai/settings/billing ").data).toBe("https://claude.ai/settings/billing");
    expect(parse("").data).toBeUndefined();
    expect(parse(undefined).data).toBeUndefined();
  });

  it("rejects anything that is not a web address", () => {
    expect(parse("javascript:alert(1)").success).toBe(false);
    expect(parse("data:text/html,hi").success).toBe(false);
    expect(parse("ftp://example.com").success).toBe(false);
    expect(parse("localhost").success).toBe(false);
    expect(parse(`https://example.com/${"a".repeat(300)}`).success).toBe(false);
  });
});

describe("subscription avatar", () => {
  it("uses the known service colour and two initials", () => {
    expect(subscriptionAvatar("ChatGPT Plus")).toEqual({ color: "#10a37f", initials: "CP" });
    expect(subscriptionAvatar("spotify")).toEqual({ color: "#1db954", initials: "SP" });
  });

  it("gives an unknown name a stable colour", () => {
    expect(subscriptionAvatar("Кинопоиск")).toEqual(subscriptionAvatar("Кинопоиск"));
    expect(subscriptionAvatar("Кинопоиск").initials).toBe("КИ");
  });
});

describe("days from today", () => {
  it("reads naturally in Russian", () => {
    expect([0, 1, -1, 2, 5, 21, -3, -11].map(formatDaysFromToday)).toEqual([
      "сегодня",
      "завтра",
      "вчера",
      "через 2 дня",
      "через 5 дней",
      "через 21 день",
      "3 дня назад",
      "11 дней назад",
    ]);
  });
});
