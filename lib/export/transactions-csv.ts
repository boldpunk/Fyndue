import { TRANSACTION_TYPE_LABELS } from "@/lib/constants/finance";
import { csvAmount, csvText, toCsv } from "./csv";

type Row = {
  type: keyof typeof TRANSACTION_TYPE_LABELS;
  direction: "INFLOW" | "OUTFLOW";
  status: "ACTUAL" | "EXPECTED";
  amount: string;
  currency: string;
  date: string;
  merchant: string | null;
  note: string | null;
  account: { name: string };
  category: { name: string } | null;
  parentCategory: string | null;
  counterpart: { accountName: string; amount: string; currency: string } | null;
};

export const TRANSACTIONS_CSV_HEADER = ["Дата", "Тип", "Счёт", "Сумма", "Валюта", "Категория", "Подкатегория", "Где / от кого", "Комментарий", "Второй счёт", "Сумма на втором счёте", "Статус"];

/** Operations as a spreadsheet: outflows negative, subcategories in their own column. */
export function transactionsToCsv(rows: Row[]): string {
  return toCsv(
    TRANSACTIONS_CSV_HEADER,
    rows.map((t) => {
      const conversion = t.type === "TRANSFER" && t.counterpart && t.counterpart.currency !== t.currency;
      return [
        t.date,
        csvText(conversion ? "Конвертация" : TRANSACTION_TYPE_LABELS[t.type]),
        csvText(t.account.name),
        csvAmount(t.direction === "OUTFLOW" ? `-${t.amount}` : t.amount),
        t.currency,
        csvText(t.parentCategory ?? t.category?.name),
        csvText(t.parentCategory ? t.category?.name : ""),
        csvText(t.merchant),
        csvText(t.note),
        csvText(t.counterpart?.accountName),
        t.counterpart ? csvAmount(t.counterpart.amount) : "",
        t.status === "EXPECTED" ? csvText("Ожидается") : "",
      ];
    }),
  );
}
