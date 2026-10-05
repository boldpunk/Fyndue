import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { createTemplate, deleteTemplate, listTemplates } from "@/lib/services/templates";
import { categoryId, createTestAccount, createUser, resetDatabase } from "../support/factories";

describe("operation templates", () => {
  beforeEach(resetDatabase);

  it("saves, lists and deletes a template; other users can't touch it", async () => {
    const user = await createUser();
    const other = await createUser();
    const card = await createTestAccount(user.id);
    const cafe = await categoryId(user.id, "Кафе и рестораны");
    const { id } = await createTemplate(user.id, { name: "Кофе", kind: "EXPENSE", accountId: card.id, categoryId: cafe, amount: "25000.00", merchant: "Starbucks" });

    expect(await listTemplates(user.id)).toEqual([
      { id, name: "Кофе", kind: "EXPENSE", accountId: card.id, categoryId: cafe, amount: "25000.00", merchant: "Starbucks", note: null },
    ]);
    expect(await listTemplates(other.id)).toEqual([]);
    await expect(deleteTemplate(other.id, id)).rejects.toThrow(DomainError);
    await deleteTemplate(user.id, id);
    expect(await listTemplates(user.id)).toEqual([]);
  });

  it("refuses a foreign category or account and a category of the wrong type", async () => {
    const user = await createUser();
    const other = await createUser();
    const otherCard = await createTestAccount(other.id);
    const salary = await categoryId(user.id, "Зарплата", "INCOME");
    await expect(createTemplate(user.id, { name: "X", kind: "EXPENSE", categoryId: salary })).rejects.toThrow(DomainError);
    await expect(createTemplate(user.id, { name: "X", kind: "EXPENSE", categoryId: await categoryId(other.id, "Такси") })).rejects.toThrow(DomainError);
    await expect(createTemplate(user.id, { name: "X", kind: "EXPENSE", categoryId: await categoryId(user.id, "Такси"), accountId: otherCard.id })).rejects.toThrow(DomainError);
  });
});
