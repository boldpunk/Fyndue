import { makeLocalDate, isLocalDate, type LocalDate } from "./dates";
import { parseMoneyInput, toMoneyString } from "./money";

/**
 * A card notification as banks send it — CardXabar (Uzcard) in Telegram:
 *
 *   🔴 E-Com oplata
 *   ➖ 5 000.00 UZS
 *   💳 ***2034
 *   📍 PLUM OPLATA, UZ
 *   🕓 16.10.26 16:31
 *   💵 5 623.83 UZS          ← balance after the operation
 *
 * Pure: the import service decides what to record.
 */
export type BankNotice = {
  title: string;
  direction: "OUT" | "IN";
  /** Decimal string, "5000.00". */
  amount: string;
  currency: string;
  cardLast4: string;
  /** Merchant or counterparty, without the trailing ", UZ". */
  place: string;
  date: LocalDate;
  time: string;
  /** Card balance after the operation, when the notice has it. */
  balanceAfter: string | null;
  /** Card-to-card transfers and currency exchange: maybe between the user's own accounts. */
  transferLike: boolean;
};

const IN_TITLES = /perevod na kartu|popolnenie|zachislenie|postuplenie|vozvrat|kirim|to'ldirish|пополнение|зачисление|поступление|перевод на карту|возврат/i;
const OUT_TITLES = /pokupka|oplata|spisanie|platezh|snyatie|xarid|to'lov|покупка|оплата|списание|платеж|платёж|снятие/i;
const TRANSFER_PLACE = /p2p|2uzcard|2humo|uzcard2|humo2|\bh2u\b|\bu2h\b|konvers|konvertats|perevod|transfer|конверс|перевод/i;

const AMOUNT = /([+\-−➖➕]?)\s*(\d{1,3}(?:[\s  ]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(UZS|USD|EUR|RUB|сум|so'm|sum)\b/i;
const DATETIME = /(\d{2})\.(\d{2})\.(\d{2}|\d{4})\s+(\d{2}):(\d{2})/;
const CARD = /\*{2,}\s?(\d{4})\b/;

/** Removes emoji and decoration so only the words and numbers are left. */
function clean(line: string): string {
  return line
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, (ch) => (ch === "➖" ? "-" : ch === "➕" ? "+" : " "))
    .replace(/\s+/g, " ")
    .trim();
}

const currencyCode = (c: string) => (/^(сум|so'm|sum)$/i.test(c) ? "UZS" : c.toUpperCase());

export function parseBankNotice(text: string): BankNotice | null {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  if (lines.length < 3) return null;

  const cardIndex = lines.findIndex((l) => CARD.test(l));
  const dateIndex = lines.findIndex((l) => DATETIME.test(l));
  const amountIndex = lines.findIndex((l) => AMOUNT.test(l));
  if (cardIndex < 0 || dateIndex < 0 || amountIndex < 0) return null;

  const amountMatch = AMOUNT.exec(lines[amountIndex]!)!;
  const amount = parseMoneyInput(amountMatch[2]!.replace(",", "."));
  if (!amount || amount.lte(0)) return null;

  const [, dd, mm, yy, hh, mi] = DATETIME.exec(lines[dateIndex]!)!;
  const year = yy!.length === 2 ? 2000 + Number(yy) : Number(yy);
  const date = makeLocalDate(year, Number(mm), Number(dd));
  if (!isLocalDate(date)) return null;

  const title = lines.slice(0, amountIndex).join(" ").replace(/^[^\p{L}]+/u, "").trim() || "Операция";
  const sign = amountMatch[1];
  const direction: "OUT" | "IN" = sign === "+" || sign === "➕" ? "IN" : sign ? "OUT" : IN_TITLES.test(title) ? "IN" : OUT_TITLES.test(title) ? "OUT" : "OUT";

  // The place is everything between the card line and the date line (it may wrap).
  const placeLines = lines.slice(cardIndex + 1, dateIndex);
  const place = placeLines.join(" ").replace(/,\s*UZ$/i, "").trim();

  const balanceLine = lines.slice(dateIndex + 1).find((l) => AMOUNT.test(l));
  const balanceMatch = balanceLine ? AMOUNT.exec(balanceLine) : null;
  const balance = balanceMatch ? parseMoneyInput(balanceMatch[2]!.replace(",", ".")) : null;

  return {
    title,
    direction,
    amount: toMoneyString(amount),
    currency: currencyCode(amountMatch[3]!),
    cardLast4: CARD.exec(lines[cardIndex]!)![1]!,
    place,
    date,
    time: `${hh}:${mi}`,
    balanceAfter: balance ? `${balanceMatch![1] === "-" ? "-" : ""}${toMoneyString(balance)}` : null,
    transferLike: TRANSFER_PLACE.test(place) || TRANSFER_PLACE.test(title),
  };
}

/** Several notices pasted or forwarded together in one message. */
export function splitBankNotices(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const isTitle = (l: string) => {
    const c = clean(l);
    return /\p{L}/u.test(c) && !AMOUNT.test(c) && !CARD.test(c) && !DATETIME.test(c);
  };
  const chunks: string[][] = [[]];
  lines.forEach((line, i) => {
    const current = chunks.at(-1)!;
    // A title line followed by an amount starts the next notice once this one has its date.
    if (current.some((l) => DATETIME.test(l)) && isTitle(line) && AMOUNT.test(clean(lines[i + 1] ?? ""))) chunks.push([]);
    chunks.at(-1)!.push(line);
  });
  return chunks.map((c) => c.join("\n")).filter((c) => parseBankNotice(c) !== null);
}
