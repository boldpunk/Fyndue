import { beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "@/lib/services/categories";
import { createTransaction, listMerchantMemory, voidTransaction } from "@/lib/services/transactions";
import { categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

describe("merchant memory", () => {
  beforeEach(resetDatabase);

  it("remembers each place once, with its latest category, scoped to the user", async () => {
    const user = await createUser();
    const other = await createUser();
    const card = await createTestAccount(user.id);
    const otherCard = await createTestAccount(other.id);
    const cafe = await categoryId(user.id, "Кафе и рестораны");
    const shop = await categoryId(user.id, "Продукты");
    const parking = await createCategory(user.id, { name: "Парковка", type: "EXPENSE", icon: "square-parking" });
    const add = (merchant: string, category: string, date: string) =>
      createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: category, amount: "1000.00", date, merchant, clientRequestId: requestId() });

    await add("Starbucks", shop, "2026-10-01");
    await add("starbucks ", cafe, "2026-10-03"); // same place, newer → its category wins
    await add("Tashkent City Parking", parking.id, "2026-10-04");
    const voided = await add("Korzinka", shop, "2026-10-02");
    await voidTransaction(user.id, voided.id);
    await createTransaction(other.id, { kind: "EXPENSE", accountId: otherCard.id, categoryId: await categoryId(other.id, "Такси"), amount: "1000.00", date: "2026-10-05", merchant: "Yandex Go", clientRequestId: requestId() });

    const memory = await listMerchantMemory(user.id);
    expect(memory).toEqual([
      { merchant: "Tashkent City Parking", type: "EXPENSE", categoryId: parking.id },
      { merchant: "starbucks", type: "EXPENSE", categoryId: cafe },
    ]);
  });
});
