import { describe, expect, it } from "vitest";
import { parseQuickEntry, type QuickEntryCategory } from "@/lib/finance/quick-entry";

const categories: QuickEntryCategory[] = [
  { id: "cafe", name: "Кафе и рестораны", type: "EXPENSE", icon: "utensils" },
  { id: "taxi", name: "Такси", type: "EXPENSE", icon: "car-taxi-front" },
  { id: "food", name: "Продукты", type: "EXPENSE", icon: "shopping-cart" },
  { id: "park", name: "Парковка", type: "EXPENSE", icon: "square-parking" },
  { id: "subs", name: "Подписки", type: "EXPENSE", icon: "repeat" },
  { id: "salary", name: "Зарплата", type: "INCOME", icon: "briefcase" },
  { id: "transfers", name: "Переводы от людей", type: "INCOME", icon: "hand-coins" },
];
const accounts = [
  { id: "uzcard", name: "Зарплатная - Uzcard", currency: "UZS" },
  { id: "visa", name: "Visa", currency: "USD" },
];
const merchants = [{ merchant: "Starbucks", type: "EXPENSE" as const, categoryId: "cafe" }, { merchant: "Yandex Go", type: "EXPENSE" as const, categoryId: "taxi" }];
const parse = (text: string) => parseQuickEntry(text, { categories, accounts, merchants });

describe("quick entry", () => {
  it("amount with multipliers and spaces", () => {
    expect(parse("кофе 25к starbucks")).toEqual({ kind: "EXPENSE", amount: "25000.00", categoryId: "cafe", merchant: "Starbucks" });
    expect(parse("парковка 5000")).toEqual({ kind: "EXPENSE", amount: "5000.00", categoryId: "park" });
    expect(parse("такси 40 500").amount).toBe("40500.00");
    expect(parse("1,5 млн продукты").amount).toBe("1500000.00");
    expect(parse("12.99$ spotify").amount).toBe("12.99");
  });

  it("income with + and by category", () => {
    expect(parse("+3 млн зарплата")).toEqual({ kind: "INCOME", amount: "3000000.00", categoryId: "salary" });
    expect(parse("зп 8000000")).toMatchObject({ kind: "INCOME", categoryId: "salary" });
    expect(parse("+500к Азиз")).toEqual({ kind: "INCOME", amount: "500000.00", merchant: "Азиз" });
  });

  it("known places bring their category; accounts by name or currency", () => {
    expect(parse("yandex 34000")).toEqual({ kind: "EXPENSE", amount: "34000.00", categoryId: "taxi", merchant: "Yandex Go" });
    expect(parse("продукты 120к uzcard")).toMatchObject({ accountId: "uzcard", categoryId: "food" });
    expect(parse("$12 подписка claude")).toMatchObject({ accountId: "visa", amount: "12.00", categoryId: "subs", merchant: "claude" });
  });

  it("unknown words become the place; nothing invented", () => {
    expect(parse("Something")).toEqual({ merchant: "Something" });
    expect(parse("")).toEqual({});
  });
});
