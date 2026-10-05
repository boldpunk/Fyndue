import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { getBudgetMonth, setBudget } from "@/lib/services/budgets";
import { createCategory, listCategories, updateCategory } from "@/lib/services/categories";
import { createTransaction } from "@/lib/services/transactions";
import { categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

describe("subcategories", () => {
  beforeEach(resetDatabase);

  it("one level, same type, own categories only", async () => {
    const user = await createUser();
    const other = await createUser();
    const car = await categoryId(user.id, "Автомобиль");
    const parking = await createCategory(user.id, { name: "Парковка", type: "EXPENSE", icon: "square-parking", parentId: car });
    expect((await listCategories(user.id)).find((c) => c.id === parking.id)?.parentId).toBe(car);

    await expect(createCategory(user.id, { name: "Уровень 3", type: "EXPENSE", icon: "tag", parentId: parking.id })).rejects.toThrow("один уровень");
    await expect(createCategory(user.id, { name: "Х", type: "EXPENSE", icon: "tag", parentId: await categoryId(user.id, "Зарплата", "INCOME") })).rejects.toThrow(DomainError);
    await expect(createCategory(user.id, { name: "Х", type: "EXPENSE", icon: "tag", parentId: await categoryId(other.id, "Автомобиль") })).rejects.toThrow(DomainError);
    // A parent with children can't move under another category.
    await expect(updateCategory(user.id, { id: car, name: "Автомобиль", icon: "car", parentId: await categoryId(user.id, "Дом") })).rejects.toThrow("подкатегории");
    // Moving back to the top level.
    await updateCategory(user.id, { id: parking.id, name: "Парковка", icon: "square-parking", parentId: null });
    expect((await listCategories(user.id)).find((c) => c.id === parking.id)?.parentId).toBeNull();
  });

  it("a parent's budget includes its subcategories; unbudgeted spending is listed once", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "1000000.00" });
    const car = await categoryId(user.id, "Автомобиль");
    const home = await categoryId(user.id, "Дом");
    const parking = await createCategory(user.id, { name: "Парковка", type: "EXPENSE", icon: "square-parking", parentId: car });
    const repairs = await createCategory(user.id, { name: "Ремонт", type: "EXPENSE", icon: "wrench", parentId: home });
    const spend = (category: string, amount: string) =>
      createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: category, amount, date: "2026-10-03", clientRequestId: requestId() });
    await spend(car, "100000.00");
    await spend(parking.id, "5000.00");
    await spend(repairs.id, "70000.00");
    await setBudget(user.id, { year: 2026, month: 10, categoryId: car, currency: "UZS", amount: "500000.00" });

    const month = await getBudgetMonth(user.id, { year: 2026, month: 10 }, "UZS");
    expect(month.categories.find((l) => l.category?.id === car)?.spent).toBe("105000.00");
    expect(month.unbudgeted.map((l) => [l.category?.id, l.spent])).toEqual([[home, "70000.00"]]);
    expect(month.totalSpent).toBe("175000.00");
  });
});
