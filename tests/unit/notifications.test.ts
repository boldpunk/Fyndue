import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, isQuietTime, localTimeIn, planReminders, type PlannerItem } from "@/lib/notifications/planner";
import { parseCommand } from "@/lib/telegram/commands-parse";
import { escapeHtml, formatDigest, formatReminder } from "@/lib/telegram/messages";

const carItem: PlannerItem = {
  itemId: "item_b",
  debtId: "debt_b",
  debtName: "Car Installment",
  debtType: "CAR_LOAN",
  currency: "UZS",
  dueDate: "2026-10-15",
  amountDue: "3500000.00",
  remainingPrincipal: "113606733.37",
};

const keys = (today: string, prefs = DEFAULT_PREFERENCES, items = [carItem]) => planReminders(items, prefs, today).map((i) => i.deduplicationKey);

describe("reminder planner", () => {
  it("fires 7, 3 and 1 days before, on the due date, and never in between twice", () => {
    expect(keys("2026-10-08")).toEqual(["due:item_b:2026-10-15:d7:tg"]);
    expect(keys("2026-10-12")).toEqual(["due:item_b:2026-10-15:d3:tg"]);
    expect(keys("2026-10-14")).toEqual(["due:item_b:2026-10-15:d1:tg"]);
    expect(keys("2026-10-15")).toEqual(["today:item_b:2026-10-15:tg"]);
    expect(keys("2026-10-01")).toEqual([]);
  });

  it("catches up inside a window with the same key, so a missed day still reminds once", () => {
    // Day 6 and 5 share the 7-day key: the job being off on day 7 still reminds on day 6,
    // and a reminder already sent on day 7 dedups on day 6.
    expect(keys("2026-10-09")).toEqual(["due:item_b:2026-10-15:d7:tg"]);
    expect(keys("2026-10-10")).toEqual(["due:item_b:2026-10-15:d7:tg"]);
    expect(keys("2026-10-13")).toEqual(["due:item_b:2026-10-15:d3:tg"]);
    const intent = planReminders([carItem], DEFAULT_PREFERENCES, "2026-10-13")[0]!;
    expect(intent.days).toBe(2);
  });

  it("overdue fires on day 1 and then every repeat interval", () => {
    const overdue = (today: string) => keys(today);
    expect(overdue("2026-10-16")).toEqual(["overdue:item_b:2026-10-15:r0:tg"]);
    expect(overdue("2026-10-17")).toEqual(["overdue:item_b:2026-10-15:r0:tg"]);
    expect(overdue("2026-10-18")).toEqual(["overdue:item_b:2026-10-15:r0:tg"]);
    expect(overdue("2026-10-19")).toEqual(["overdue:item_b:2026-10-15:r1:tg"]);
    expect(overdue("2026-10-22")).toEqual(["overdue:item_b:2026-10-15:r2:tg"]);
    const weekly = { ...DEFAULT_PREFERENCES, overdueRepeatDays: 7 };
    expect(keys("2026-10-22", weekly)).toEqual(["overdue:item_b:2026-10-15:r0:tg"]);
    expect(keys("2026-10-23", weekly)).toEqual(["overdue:item_b:2026-10-15:r1:tg"]);
  });

  it("respects switched-off rules and custom day lists", () => {
    const prefs = { ...DEFAULT_PREFERENCES, notifyDaysBefore: [2], notifyOnDueDate: false, notifyWhenOverdue: false };
    expect(keys("2026-10-08", prefs)).toEqual([]);
    expect(keys("2026-10-13", prefs)).toEqual(["due:item_b:2026-10-15:d2:tg"]);
    expect(keys("2026-10-15", prefs)).toEqual([]);
    expect(keys("2026-10-16", prefs)).toEqual([]);
  });

  it("a rescheduled due date gets fresh keys", () => {
    const moved = { ...carItem, dueDate: "2026-10-20" };
    expect(keys("2026-10-17", DEFAULT_PREFERENCES, [moved])).toEqual(["due:item_b:2026-10-20:d3:tg"]);
  });

  it("orders overdue first, then due today, then soonest", () => {
    const items: PlannerItem[] = [
      { ...carItem, itemId: "soon", dueDate: "2026-10-18" },
      { ...carItem, itemId: "today", dueDate: "2026-10-15" },
      { ...carItem, itemId: "late", dueDate: "2026-10-10" },
      { ...carItem, itemId: "tomorrow", dueDate: "2026-10-16" },
    ];
    expect(planReminders(items, DEFAULT_PREFERENCES, "2026-10-15").map((i) => [i.item.itemId, i.type])).toEqual([
      ["late", "OVERDUE"],
      ["today", "DUE_TODAY"],
      ["tomorrow", "DUE_IN_DAYS"],
      ["soon", "DUE_IN_DAYS"],
    ]);
  });
});

describe("quiet hours", () => {
  it("handles windows that wrap midnight", () => {
    expect(isQuietTime("23:30", "22:00", "09:00")).toBe(true);
    expect(isQuietTime("02:00", "22:00", "09:00")).toBe(true);
    expect(isQuietTime("09:00", "22:00", "09:00")).toBe(false);
    expect(isQuietTime("21:59", "22:00", "09:00")).toBe(false);
  });

  it("handles same-day windows and no window", () => {
    expect(isQuietTime("13:00", "12:00", "14:00")).toBe(true);
    expect(isQuietTime("14:00", "12:00", "14:00")).toBe(false);
    expect(isQuietTime("03:00", null, null)).toBe(false);
    expect(isQuietTime("03:00", "10:00", "10:00")).toBe(false);
  });

  it("reads the wall clock in the user's time zone", () => {
    // 2026-10-15T04:30Z is 09:30 in Tashkent (UTC+5).
    expect(localTimeIn("Asia/Tashkent", new Date("2026-10-15T04:30:00Z"))).toBe("09:30");
    expect(localTimeIn("UTC", new Date("2026-10-15T00:05:00Z"))).toBe("00:05");
  });
});

describe("telegram messages", () => {
  it("formats an upcoming reminder like SPEC §34", () => {
    const [intent] = planReminders([carItem], DEFAULT_PREFERENCES, "2026-10-12");
    expect(formatReminder(intent!, "2026-10-12")).toBe(
      ["🚘 <b>Car Installment</b>", "", "Платёж через 3 дня", "", "<b>3\u00a0500\u00a0000 UZS</b>", "", "Срок:", "15 октября", "", "Остаток долга:", "113\u00a0606\u00a0733,37 UZS"].join("\n"),
    );
  });

  it("formats due today and overdue reminders", () => {
    const [today] = planReminders([carItem], DEFAULT_PREFERENCES, "2026-10-15");
    expect(formatReminder(today!, "2026-10-15")).toContain("Платёж сегодня");
    const credit = { ...carItem, debtName: "Credit", debtType: "CREDIT" as const, amountDue: "2480000.00", dueDate: "2026-10-22" };
    const [overdue] = planReminders([credit], DEFAULT_PREFERENCES, "2026-10-23");
    expect(formatReminder(overdue!, "2026-10-23")).toBe(
      ["⚠️ <b>Платёж просрочен</b>", "", "Credit", "", "Нужно оплатить:", "<b>2\u00a0480\u00a0000 UZS</b>", "", "Срок был:", "22 октября", "", "Просрочка:", "1 день"].join("\n"),
    );
  });

  it("adds the year only when it differs, and declines «день»", () => {
    const next = { ...carItem, dueDate: "2027-01-01" };
    const [intent] = planReminders([next], DEFAULT_PREFERENCES, "2026-12-31");
    const text = formatReminder(intent!, "2026-12-31");
    expect(text).toContain("Платёж через 1 день");
    expect(text).toContain("1 января 2027\n");
  });

  it("escapes user text", () => {
    expect(escapeHtml(`<b>"A&B"</b>`)).toBe("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;");
    const [intent] = planReminders([{ ...carItem, debtName: "<script>" }], DEFAULT_PREFERENCES, "2026-10-12");
    expect(formatReminder(intent!, "2026-10-12")).toContain("&lt;script&gt;");
  });

  it("joins several reminders into one digest", () => {
    const intents = planReminders([carItem, { ...carItem, itemId: "x", debtName: "Credit", dueDate: "2026-10-14" }], DEFAULT_PREFERENCES, "2026-10-12");
    const digest = formatDigest(intents, "2026-10-12");
    expect(digest.split("━━━━━━━━").length).toBe(2);
    expect(digest).toContain("Credit");
    expect(digest).toContain("Car Installment");
    expect(formatDigest(intents.slice(0, 1), "2026-10-12")).toBe(formatReminder(intents[0]!, "2026-10-12"));
  });
});

describe("command parsing", () => {
  it("parses commands, bot mentions and arguments", () => {
    expect(parseCommand("/start ABCD2345")).toEqual({ command: "start", args: ["ABCD2345"] });
    expect(parseCommand("/today@FyndueBot")).toEqual({ command: "today", args: [] });
    expect(parseCommand("  /UPCOMING  ")).toEqual({ command: "upcoming", args: [] });
    expect(parseCommand("hello")).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
  });
});
