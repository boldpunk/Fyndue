import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { TelegramSender } from "@/lib/telegram/client";
import {
  createSharedTransaction,
  getSharedAccount,
  listAccountMembers,
  listSharedWithMe,
  removeShare,
  shareAccount,
  voidSharedTransaction,
} from "@/lib/services/shared-accounts";
import { createTransaction, listTransactions } from "@/lib/services/transactions";
import { balanceOf, categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

function fakeSender() {
  const sent: { chatId: string; html: string }[] = [];
  const sender: TelegramSender & { sent: typeof sent } = {
    sent,
    async sendMessage(chatId, html) {
      sent.push({ chatId, html });
      return { messageId: "1" };
    },
  };
  return sender;
}

async function family() {
  const owner = await createUser("Саидакбар");
  const member = await createUser("Мадина");
  const stranger = await createUser("Чужой");
  await prisma.user.update({ where: { id: member.id }, data: { phoneNumber: "+998901112233" } });
  const card = await createTestAccount(owner.id, { name: "Семейная карта", openingBalance: "1000000.00" });
  const privateCard = await createTestAccount(owner.id, { name: "Личная Visa" });
  return { owner, member, stranger, card, privateCard };
}

describe("shared accounts (family card)", () => {
  beforeEach(resetDatabase);

  it("owner invites by phone; member sees the account, adds an expense, the owner's balance and list update", async () => {
    const { owner, member, card } = await family();
    await prisma.telegramConnection.create({ data: { userId: owner.id, telegramChatId: "100", status: "CONNECTED" } });
    const sender = fakeSender();
    await shareAccount(owner.id, { accountId: card.id, contact: "90 111 22 33" }, sender);

    expect(await listAccountMembers(owner.id, card.id)).toMatchObject([{ name: "Мадина", contact: expect.any(String) }]);
    expect(await listSharedWithMe(member.id)).toMatchObject([{ account: { id: card.id, name: "Семейная карта", currentBalance: "1000000.00" }, owner: { name: "Саидакбар" } }]);

    const detail = await getSharedAccount(member.id, card.id);
    const food = detail.categories.find((c) => c.name === "Продукты")!;
    const { id } = await createSharedTransaction(
      member.id,
      { kind: "EXPENSE", accountId: card.id, categoryId: food.id, amount: "120000.00", date: "2026-10-05", merchant: "Korzinka", clientRequestId: requestId() },
      sender,
    );
    expect(await balanceOf(card.id)).toBe("880000.00");
    const ownerList = await listTransactions(owner.id, { page: 1 });
    expect(ownerList.items.find((t) => t.id === id)).toMatchObject({ createdBy: "Мадина", merchant: "Korzinka" });
    expect(sender.sent.at(-1)).toMatchObject({ chatId: "100" });
    expect(sender.sent.at(-1)!.html).toContain("Мадина добавил(а) расход");

    expect((await getSharedAccount(member.id, card.id)).transactions[0]).toMatchObject({ id, mine: true });
    await voidSharedTransaction(member.id, id);
    expect(await balanceOf(card.id)).toBe("1000000.00");
  });

  it("a member reaches only the shared account — never other accounts, others' rows or someone else's share", async () => {
    const { owner, member, stranger, card, privateCard } = await family();
    await shareAccount(owner.id, { accountId: card.id, contact: "+998901112233" });
    const food = await categoryId(owner.id, "Продукты");
    const expense = (accountId: string) => ({ kind: "EXPENSE" as const, accountId, categoryId: food, amount: "1.00", date: "2026-10-05", clientRequestId: requestId() });

    await expect(createSharedTransaction(member.id, expense(privateCard.id))).rejects.toThrow(DomainError);
    await expect(getSharedAccount(member.id, privateCard.id)).rejects.toThrow(DomainError);
    await expect(getSharedAccount(stranger.id, card.id)).rejects.toThrow(DomainError);
    await expect(createSharedTransaction(stranger.id, expense(card.id))).rejects.toThrow(DomainError);
    // A category that isn't the owner's is refused too.
    await expect(createSharedTransaction(member.id, { ...expense(card.id), categoryId: await categoryId(member.id, "Продукты") })).rejects.toThrow(DomainError);

    // The owner's own operations can't be cancelled by the member.
    const ownerRow = await createTransaction(owner.id, expense(card.id));
    await expect(voidSharedTransaction(member.id, ownerRow.id)).rejects.toThrow(DomainError);

    // A transfer to a private account shows up without naming it.
    await createTransaction(owner.id, { kind: "TRANSFER", fromAccountId: card.id, toAccountId: privateCard.id, amount: "5.00", date: "2026-10-05", clientRequestId: requestId() });
    const transfer = (await getSharedAccount(member.id, card.id)).transactions.find((t) => t.type === "TRANSFER")!;
    expect(transfer.counterpart?.accountName).toBe("другой счёт владельца");
    expect(JSON.stringify(await getSharedAccount(member.id, card.id))).not.toContain("Личная Visa");
  });

  it("invites: only existing users, not yourself, no duplicates, only your own account; removal and leaving end access", async () => {
    const { owner, member, stranger, card } = await family();
    await expect(shareAccount(owner.id, { accountId: card.id, contact: "+998909999999" })).rejects.toThrow("зарегистрируется");
    await expect(shareAccount(owner.id, { accountId: card.id, contact: owner.email })).rejects.toThrow("собственный");
    await expect(shareAccount(stranger.id, { accountId: card.id, contact: member.email })).rejects.toThrow(DomainError);
    const { shareId } = await shareAccount(owner.id, { accountId: card.id, contact: member.email.toUpperCase() });
    await expect(shareAccount(owner.id, { accountId: card.id, contact: member.email })).rejects.toThrow("уже есть доступ");

    await expect(removeShare(stranger.id, shareId)).rejects.toThrow(DomainError);
    await removeShare(member.id, shareId); // member leaves
    expect(await listSharedWithMe(member.id)).toEqual([]);
    await expect(getSharedAccount(member.id, card.id)).rejects.toThrow(DomainError);

    const again = await shareAccount(owner.id, { accountId: card.id, contact: member.email });
    await removeShare(owner.id, again.shareId); // owner removes
    expect(await listAccountMembers(owner.id, card.id)).toEqual([]);
  });
});
