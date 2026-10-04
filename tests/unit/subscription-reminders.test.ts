import { describe, expect, it } from "vitest";
import { planSubscriptionReminders, type SubscriptionReminderItem } from "@/lib/notifications/subscription-planner";
import { formatDigest, formatSubscriptionReminder } from "@/lib/telegram/messages";

const today = "2026-10-04";
const item = (over: Partial<SubscriptionReminderItem> = {}): SubscriptionReminderItem => ({
  recurringId: "sub1",
  name: "Claude Pro",
  amount: "20.00",
  currency: "USD",
  chargeDate: "2026-10-05",
  frequency: "MONTHLY",
  accountName: "Visa USD",
  accountBalance: "330.50",
  url: "https://claude.ai/settings/billing",
  ...over,
});
const on = (days = 1) => ({ subscriptionReminders: true, subscriptionDaysBefore: days });
const keys = (items: SubscriptionReminderItem[], prefs = on(), day = today) => planSubscriptionReminders(items, prefs, day).map((i) => i.deduplicationKey);

describe("subscription reminder planner", () => {
  it("reminds the day before, and on the day if that was missed — one message either way", () => {
    expect(keys([item({ chargeDate: "2026-10-06" })])).toEqual([]);
    expect(keys([item()])).toEqual(["sub:sub1:2026-10-05:d1:tg"]);
    expect(keys([item({ chargeDate: today })])).toEqual(["sub:sub1:2026-10-04:d1:tg"]);
    expect(keys([item({ chargeDate: "2026-10-03" })])).toEqual([]); // charged already: no "overdue"
  });

  it("honours the chosen lead time, including the day of the charge", () => {
    expect(keys([item({ chargeDate: "2026-10-07" })], on(3))).toEqual(["sub:sub1:2026-10-07:d3:tg"]);
    expect(keys([item()], on(0))).toEqual([]);
    expect(keys([item({ chargeDate: today })], on(0))).toEqual(["sub:sub1:2026-10-04:d0:tg"]);
  });

  it("announces yearly renewals a week ahead as well", () => {
    const yearly = (chargeDate: string) => item({ frequency: "YEARLY", chargeDate });
    expect(keys([yearly("2026-10-12")])).toEqual([]);
    expect(keys([yearly("2026-10-11")])).toEqual(["sub:sub1:2026-10-11:d7:tg"]);
    expect(keys([yearly("2026-10-09")])).toEqual(["sub:sub1:2026-10-09:d7:tg"]);
    expect(keys([yearly("2026-10-05")])).toEqual(["sub:sub1:2026-10-05:d1:tg"]);
  });

  it("is silent when switched off, and lists the soonest first", () => {
    expect(keys([item()], { subscriptionReminders: false, subscriptionDaysBefore: 1 })).toEqual([]);
    const plan = planSubscriptionReminders([item({ recurringId: "b", name: "Spotify" }), item({ recurringId: "a", name: "Сервер", chargeDate: today })], on(), today);
    expect(plan.map((p) => p.item.name)).toEqual(["Сервер", "Spotify"]);
  });
});

describe("subscription reminder message", () => {
  const intent = (over: Partial<SubscriptionReminderItem> = {}) => planSubscriptionReminders([item(over)], on(), today)[0]!;

  it("says when, how much and from which card", () => {
    const text = formatSubscriptionReminder(intent(), today);
    expect(text).toContain("🔁 <b>Claude Pro</b>");
    expect(text).toContain("Спишется завтра, 5 октября");
    expect(text).toContain("<b>20 USD</b>");
    expect(text).toContain("С карты: Visa USD");
    expect(text).toContain("На ней сейчас: 330,50 USD");
    expect(text).toContain("Управлять: https://claude.ai/settings/billing");
    expect(text).not.toContain("не хватает");
  });

  it("warns when the card is short, and before a yearly renewal", () => {
    expect(formatSubscriptionReminder(intent({ accountBalance: "12.00" }), today)).toContain("⚠️ Денег на карте не хватает");
    const yearly = planSubscriptionReminders([item({ frequency: "YEARLY", chargeDate: "2026-10-10", name: "Домен fyndue.uz" })], on(), today)[0]!;
    expect(formatSubscriptionReminder(yearly, today)).toContain("Это продление на год");
    expect(formatSubscriptionReminder(yearly, today)).toContain("Спишется через 6 дней");
  });

  it("escapes user text", () => {
    const text = formatSubscriptionReminder(intent({ name: "<b>x</b> & co", url: null }), today);
    expect(text).toContain("&lt;b&gt;x&lt;/b&gt; &amp; co");
    expect(text).not.toContain("Управлять");
  });

  it("goes into the same digest as debt reminders", () => {
    expect(formatDigest([intent(), intent({ recurringId: "x", name: "Spotify" })], today)).toContain("━━━━━━━━");
  });
});
