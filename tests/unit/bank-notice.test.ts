import { describe, expect, it } from "vitest";
import { parseBankNotice, splitBankNotices } from "@/lib/finance/bank-notice";

const ecom = `🔴 E-Com oplata
➖ 5 000.00 UZS
💳 ***2034
📍 PLUM OPLATA, UZ
🕓 16.10.26 16:31
💵 5 623.83 UZS`;

const pokupka = `🔴 Pokupka
➖ 428 000.00 UZS
💳 ***9099
📍 SAZANJON OTOV, Toshkent, OSh ORON
MFY  KUYI TOLARIK KOCh
🕓 16.10.25 20:03
💵 251 899.14 UZS`;

const incoming = `🟢 Perevod na kartu
➕ 100 000.00 UZS
💳 ***9099
📍 UZUMBANK UZCARD2UZCARD P2P, UZ
🕓 19.10.25 12:40
💵 150 554.14 UZS`;

describe("bank notices (CardXabar)", () => {
  it("reads a payment", () => {
    expect(parseBankNotice(ecom)).toEqual({
      title: "E-Com oplata",
      direction: "OUT",
      amount: "5000.00",
      currency: "UZS",
      cardLast4: "2034",
      place: "PLUM OPLATA",
      date: "2026-10-16",
      time: "16:31",
      balanceAfter: "5623.83",
      transferLike: false,
    });
  });

  it("joins a wrapped place, reads big amounts and incoming transfers", () => {
    expect(parseBankNotice(pokupka)).toMatchObject({ amount: "428000.00", place: "SAZANJON OTOV, Toshkent, OSh ORON MFY KUYI TOLARIK KOCh", date: "2025-10-16", direction: "OUT" });
    expect(parseBankNotice(incoming)).toMatchObject({ direction: "IN", amount: "100000.00", transferLike: true, balanceAfter: "150554.14" });
    expect(parseBankNotice("🔴 Platezh\n➖ 14 562 000.00 UZS\n💳 ***4930\n📍 UZCARD KONVERTATSIYA S KAR, UZ\n🕓 19.10.25 12:40\n💵 5 753 456.49 UZS")).toMatchObject({ amount: "14562000.00", transferLike: true });
  });

  it("works without emoji (copied text) and ignores other messages", () => {
    expect(parseBankNotice(ecom.replace(/[^\x20-\x7E\nЀ-ӿ]/g, ""))).toMatchObject({ amount: "5000.00", cardLast4: "2034" });
    expect(parseBankNotice("Привет! /today")).toBeNull();
    expect(parseBankNotice("кофе 25к starbucks")).toBeNull();
  });

  it("splits several notices pasted together", () => {
    expect(splitBankNotices(`${ecom}\n${pokupka}\n${incoming}`).map((t) => parseBankNotice(t)!.amount)).toEqual(["5000.00", "428000.00", "100000.00"]);
  });
});
