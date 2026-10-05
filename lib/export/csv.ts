/**
 * CSV that Excel opens correctly in a Russian locale: UTF-8 with a BOM,
 * «;» between columns, decimal comma, CRLF line ends. Text cells that start
 * like a formula are prefixed with «'» so a spreadsheet never runs them.
 */

export type CsvCell = string | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvText(value: CsvCell): string {
  const text = value ?? "";
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** "-120000.00" → "-120000,00": a number cell, never escaped. */
export function csvAmount(value: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`Not a decimal amount: ${value}`);
  return value.replace(".", ",");
}

export function toCsv(header: string[], rows: string[][]): string {
  return "﻿" + [header.map(csvText), ...rows].map((r) => r.join(";")).join("\r\n") + "\r\n";
}
