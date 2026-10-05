import { beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "@/lib/services/categories";
import { createTransaction, exportTransactions, listTransactions } from "@/lib/services/transactions";
import { categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

describe("operations export", () => {
  beforeEach(resetDatabase);

  it("exports the filtered month with subcategory names, only the user's rows; a parent filter includes subcategories", async () => {
    const user = await createUser();
    const other = await createUser();
    const card = await createTestAccount(user.id);
    const car = await categoryId(user.id, "Автомобиль");
    const parking = await createCategory(user.id, { name: "Парковка", type: "EXPENSE", icon: "square-parking", parentId: car });
    const add = (category: string, date: string) =>
      createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: category, amount: "5000.00", date, clientRequestId: requestId() });
    await add(parking.id, "2026-10-05");
    await add(car, "2026-10-06");
    await add(car, "2026-09-30");
    const otherCard = await createTestAccount(other.id);
    await createTransaction(other.id, { kind: "EXPENSE", accountId: otherCard.id, categoryId: await categoryId(other.id, "Такси"), amount: "1.00", date: "2026-10-05", clientRequestId: requestId() });

    const rows = await exportTransactions(user.id, { month: "2026-10" });
    expect(rows.map((r) => [r.date, r.category?.name, r.parentCategory])).toEqual([
      ["2026-10-05", "Парковка", "Автомобиль"],
      ["2026-10-06", "Автомобиль", null],
    ]);
    expect((await listTransactions(user.id, { category: car, page: 1 })).total).toBe(3);
  });
});
