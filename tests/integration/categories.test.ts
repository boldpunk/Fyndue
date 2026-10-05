import { beforeEach, describe, expect, it } from "vitest";
import {
  createCategory,
  listCategories,
  reorderCategories,
  setCategoryArchived,
  updateCategory,
} from "@/lib/services/categories";
import { createUser, resetDatabase } from "../support/factories";

describe("categories", () => {
  beforeEach(resetDatabase);

  it("seeds the SPEC default categories for every new user", async () => {
    const user = await createUser();
    const expense = await listCategories(user.id, { type: "EXPENSE" });
    const income = await listCategories(user.id, { type: "INCOME" });
    expect(expense.map((c) => c.name)).toEqual(expect.arrayContaining(["Топливо", "eSIM и роуминг"]));
    expect(expense).toHaveLength(19);
    expect(income.map((c) => c.name)).toEqual(["Зарплата", "Переводы от людей", "Фриланс", "Премия", "Наличные", "Возврат", "Другое"]);
    expect(expense.find((c) => c.name === "Платежи по долгам")?.isSystem).toBe(true);
  });

  it("creates, renames, reorders and archives", async () => {
    const user = await createUser();
    const pets = await createCategory(user.id, { name: "Pets", type: "EXPENSE", icon: "paw-print", color: "amber" });
    expect(pets.sortOrder).toBe(19);

    await expect(createCategory(user.id, { name: "Pets", type: "EXPENSE", icon: "paw-print" })).rejects.toThrow(/уже есть/);
    await expect(updateCategory(user.id, { id: pets.id, name: "Топливо", icon: "fuel" })).rejects.toThrow(/уже есть/);

    const renamed = await updateCategory(user.id, { id: pets.id, name: "Pet care", icon: "paw-print" });
    expect(renamed.name).toBe("Pet care");

    const all = await listCategories(user.id, { type: "EXPENSE" });
    const reversed = all.map((c) => c.id).reverse();
    await reorderCategories(user.id, { type: "EXPENSE", orderedIds: reversed });
    expect((await listCategories(user.id, { type: "EXPENSE" }))[0]?.name).toBe("Pet care");

    await setCategoryArchived(user.id, pets.id, true);
    expect((await listCategories(user.id, { type: "EXPENSE" })).some((c) => c.id === pets.id)).toBe(false);
    expect((await listCategories(user.id, { type: "EXPENSE", includeArchived: true })).some((c) => c.id === pets.id)).toBe(true);
  });

  it("protects system categories from archiving", async () => {
    const user = await createUser();
    const debt = (await listCategories(user.id, { type: "EXPENSE" })).find((c) => c.isSystem)!;
    await expect(setCategoryArchived(user.id, debt.id, true)).rejects.toThrow(/нельзя архивировать/);
  });
});
