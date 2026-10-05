import { describe, expect, it } from "vitest";
import { csvText } from "@/lib/export/csv";
import { transactionsToCsv } from "@/lib/export/transactions-csv";

describe("CSV export", () => {
  it("escapes separators and quotes, and defuses formulas", () => {
    expect(csvText("Кафе; бар")).toBe('"Кафе; бар"');
    expect(csvText('ООО "Ромашка"')).toBe('"ООО ""Ромашка"""');
    expect(csvText("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvText("+998 90")).toBe("'+998 90");
    expect(csvText(null)).toBe("");
  });

  it("writes operations for Excel: BOM, «;», decimal comma, negative outflows, subcategory column", () => {
    const csv = transactionsToCsv([
      { type: "EXPENSE", direction: "OUTFLOW", status: "ACTUAL", amount: "5000.00", currency: "UZS", date: "2026-10-05", merchant: "Tashkent City", note: null, account: { name: "Uzcard" }, category: { name: "Парковка" }, parentCategory: "Автомобиль", counterpart: null },
      { type: "TRANSFER", direction: "OUTFLOW", status: "ACTUAL", amount: "126500.00", currency: "UZS", date: "2026-10-06", merchant: null, note: "на поездку", account: { name: "Uzcard" }, category: null, parentCategory: null, counterpart: { accountName: "Visa", amount: "10.00", currency: "USD" } },
      { type: "INCOME", direction: "INFLOW", status: "EXPECTED", amount: "8000000.50", currency: "UZS", date: "2026-10-10", merchant: null, note: null, account: { name: "Uzcard" }, category: { name: "Зарплата" }, parentCategory: null, counterpart: null },
    ]);
    const lines = csv.split("\r\n");
    expect(csv.startsWith("﻿Дата;Тип;Счёт;Сумма")).toBe(true);
    expect(lines[1]).toBe("2026-10-05;Расход;Uzcard;-5000,00;UZS;Автомобиль;Парковка;Tashkent City;;;;");
    expect(lines[2]).toBe("2026-10-06;Конвертация;Uzcard;-126500,00;UZS;;;;на поездку;Visa;10,00;");
    expect(lines[3]).toBe("2026-10-10;Доход;Uzcard;8000000,50;UZS;Зарплата;;;;;;Ожидается");
  });
});
