import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { importBankNotices, linkCard, undoLastImport } from "@/lib/services/bank-import";
import { createTransaction } from "@/lib/services/transactions";
import { balanceOf, categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

const notice = (title: string, sign: "➖" | "➕", amount: string, card: string, place: string, when: string, balance = "1 000.00") =>
  `${sign === "➖" ? "🔴" : "🟢"} ${title}\n${sign} ${amount} UZS\n💳 ***${card}\n📍 ${place}, UZ\n🕓 ${when}\n💵 ${balance} UZS`;

async function setup() {
  const user = await createUser();
  const uzum = await createTestAccount(user.id, { name: "Uzum Карта", openingBalance: "1000000.00" });
  const uzcard = await createTestAccount(user.id, { name: "Личная Uzcard", openingBalance: "1000000.00" });
  await prisma.account.update({ where: { id: uzum.id }, data: { cardLast4: "9099" } });
  await prisma.account.update({ where: { id: uzcard.id }, data: { cardLast4: "4930" } });
  return { user, uzum, uzcard };
}

describe("automatic bookkeeping from bank notices", () => {
  beforeEach(resetDatabase);

  it("records a purchase on the card's account, once, with the place and a category", async () => {
    const { user, uzum } = await setup();
    const text = notice("Pokupka", "➖", "28 000.00", "9099", "YANDEX GO", "16.10.26 16:37", "972 000.00");
    const [r] = await importBankNotices(user.id, text);
    expect(r).toMatchObject({ status: "recorded", accountName: "Uzum Карта", categoryName: "Такси" });
    expect(r!.balanceMismatch).toBeUndefined(); // 1 000 000 − 28 000 = the bank's balance
    expect(await balanceOf(uzum.id)).toBe("972000.00");
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: r!.transactionId } });
    expect(row).toMatchObject({ source: "IMPORT", merchant: "YANDEX GO", type: "EXPENSE" });

    expect((await importBankNotices(user.id, text))[0]!.status).toBe("duplicate");
    expect(await balanceOf(uzum.id)).toBe("972000.00");
  });

  it("joins the two halves of a transfer between own cards, with the bank's fee", async () => {
    const { user, uzum, uzcard } = await setup();
    const out = notice("Spisanie c karty", "➖", "100 700.00", "4930", "UZUMBANK UZCARD2UZCARD P2P", "19.10.26 12:40");
    const inn = notice("Perevod na kartu", "➕", "100 000.00", "9099", "UZUMBANK UZCARD2UZCARD P2P", "19.10.26 12:40");
    const [first] = await importBankNotices(user.id, out);
    expect(first!.status).toBe("recorded");
    const [second] = await importBankNotices(user.id, inn);
    expect(second).toMatchObject({ status: "transfer", accountName: "Личная Uzcard", counterpartName: "Uzum Карта", fee: "700.00" });
    expect(await balanceOf(uzcard.id)).toBe("899300.00");
    expect(await balanceOf(uzum.id)).toBe("1100000.00");
    // No expense or income counted twice: one transfer + one fee.
    const live = await prisma.transaction.findMany({ where: { userId: user.id, voidedAt: null } });
    expect(live.map((t) => t.type).sort()).toEqual(["EXPENSE", "TRANSFER", "TRANSFER"]);
    // Forwarding the same pair again changes nothing.
    expect((await importBankNotices(user.id, `${out}\n${inn}`)).map((r) => r.status)).toEqual(["duplicate", "duplicate"]);
  });

  it("unknown cards, typed-by-hand operations, dates before tracking", async () => {
    const { user, uzum } = await setup();
    const ecom = notice("E-Com oplata", "➖", "5 000.00", "2034", "PLUM OPLATA", "16.10.26 16:31");
    expect((await importBankNotices(user.id, ecom))[0]!.status).toBe("unknown-card");
    expect(await linkCard(user.id, "2034", "uzum")).toContain("привязана");
    expect((await importBankNotices(user.id, ecom))[0]!.status).toBe("recorded");

    await createTransaction(user.id, { kind: "EXPENSE", accountId: uzum.id, categoryId: await categoryId(user.id, "Продукты"), amount: "64000.00", date: "2026-10-19", clientRequestId: requestId() });
    expect((await importBankNotices(user.id, notice("Pokupka", "➖", "64 000.00", "9099", "KORZINKA", "19.10.26 12:41")))[0]!.status).toBe("manual-duplicate");

    await prisma.account.update({ where: { id: uzum.id }, data: { trackingStartDate: new Date("2026-10-01T00:00:00Z") } });
    expect((await importBankNotices(user.id, notice("Pokupka", "➖", "1 000.00", "9099", "OLD", "16.09.26 10:00")))[0]!.status).toBe("before-tracking");
  });

  it("/undo cancels the latest imported operation; other users' cards never match", async () => {
    const { user, uzum } = await setup();
    const other = await createUser();
    await importBankNotices(user.id, notice("Pokupka", "➖", "10 000.00", "9099", "BON", "16.10.26 10:00"));
    expect((await importBankNotices(other.id, notice("Pokupka", "➖", "10 000.00", "9099", "BON", "16.10.26 10:00")))[0]!.status).toBe("unknown-card");
    expect(await undoLastImport(user.id)).toContain("Отменил");
    expect(await balanceOf(uzum.id)).toBe("1000000.00");
  });
});

describe("notices through the bot and the personal link", () => {
  beforeEach(resetDatabase);

  it("a notice forwarded to the bot is recorded and confirmed; /card links a card", async () => {
    const { handleUpdate } = await import("@/lib/telegram/commands");
    const { user, uzum } = await setup();
    await prisma.telegramConnection.create({ data: { userId: user.id, telegramChatId: "321", status: "CONNECTED" } });
    const sent: string[] = [];
    const sender = { async sendMessage(_c: string, html: string) { sent.push(html); return { messageId: "1" }; } };
    const msg = (text: string) => ({ update_id: 1, message: { message_id: 1, chat: { id: 321, type: "private" }, from: { id: 321 }, text } });

    await handleUpdate(msg(notice("E-Com oplata", "➖", "5 000.00", "2034", "PLUM OPLATA", "16.10.26 16:31")), sender);
    expect(sent.at(-1)).toContain("/card 2034");
    await handleUpdate(msg("/card 2034 Uzum"), sender);
    expect(sent.at(-1)).toContain("привязана");
    await handleUpdate(msg(notice("E-Com oplata", "➖", "5 000.00", "2034", "PLUM OPLATA", "16.10.26 16:31")), sender);
    expect(sent.at(-1)).toContain("Расход");
    expect(await balanceOf(uzum.id)).toBe("995000.00");
    await handleUpdate(msg("/undo"), sender);
    expect(await balanceOf(uzum.id)).toBe("1000000.00");
  });

  it("the personal link accepts plain text and JSON; a wrong or revoked token is refused", async () => {
    const { POST } = await import("@/app/api/ingest/[token]/route");
    const { createIngestToken, revokeIngestToken } = await import("@/lib/services/ingest-link");
    const { user, uzum } = await setup();
    const token = await createIngestToken(user.id);
    const call = (t: string, body: string, type = "text/plain") =>
      POST(new Request(`http://x/api/ingest/${t}`, { method: "POST", body, headers: { "content-type": type } }), { params: Promise.resolve({ token: t }) });

    const ok = await call(token, notice("Pokupka", "➖", "12 000.00", "9099", "KORZINKA", "16.10.26 18:00"));
    expect(ok.status).toBe(200);
    expect(await balanceOf(uzum.id)).toBe("988000.00");
    const json = await call(token, JSON.stringify({ text: notice("Pokupka", "➖", "3 000.00", "9099", "BON", "16.10.26 18:05") }), "application/json");
    expect(((await json.json()) as { results: { status: string }[] }).results[0]!.status).toBe("recorded");
    expect((await call(token, "привет")).status).toBe(422);
    expect((await call("x".repeat(32), "text")).status).toBe(404);
    await revokeIngestToken(user.id);
    expect((await call(token, "text")).status).toBe(404);
  });
});
