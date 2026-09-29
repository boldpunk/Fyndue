/**
 * Calendar-date helpers. Business dates (transaction date, due date, payment
 * date) are `LocalDate` strings in the form YYYY-MM-DD. They carry no time
 * zone, so converting to and from UTC can never move them by a day
 * (SPEC §47). Instants (createdAt, …) stay as Date objects.
 */

export type LocalDate = string;

export const DEFAULT_TIMEZONE = "Asia/Tashkent";

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isLocalDate(value: string): value is LocalDate {
  const match = LOCAL_DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseLocalDate(value: LocalDate): { year: number; month: number; day: number } {
  if (!isLocalDate(value)) throw new RangeError(`Invalid date "${value}", expected YYYY-MM-DD`);
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

/** Today's calendar date in the given IANA time zone. */
export function todayIn(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Prisma maps @db.Date to a Date at UTC midnight. */
export function localDateToDb(value: LocalDate): Date {
  parseLocalDate(value);
  return new Date(`${value}T00:00:00.000Z`);
}

export function dbToLocalDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

function toEpochDay(value: LocalDate): number {
  const { year, month, day } = parseLocalDate(value);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromEpochDay(epochDay: number): LocalDate {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(value: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(value) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/**
 * Adds calendar months, clamping the day to the target month's length:
 * 2024-01-31 + 1 month = 2024-02-29; 2025-01-31 + 1 month = 2025-02-28.
 */
export function addMonthsClamped(value: LocalDate, months: number, preferredDay?: number): LocalDate {
  const { year, month, day } = parseLocalDate(value);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  const targetDay = Math.min(preferredDay ?? day, daysInMonth(targetYear, targetMonth));
  return makeLocalDate(targetYear, targetMonth, targetDay);
}

export type YearMonth = { year: number; month: number };

export function yearMonthOf(value: LocalDate): YearMonth {
  const { year, month } = parseLocalDate(value);
  return { year, month };
}

/** First day of the month and first day of the following month (exclusive end). */
export function monthBounds({ year, month }: YearMonth): { start: LocalDate; endExclusive: LocalDate } {
  const start = makeLocalDate(year, month, 1);
  return { start, endExclusive: addMonthsClamped(start, 1) };
}

export function shiftYearMonth({ year, month }: YearMonth, delta: number): YearMonth {
  return yearMonthOf(addMonthsClamped(makeLocalDate(year, month, 1), delta));
}

/** "2026-09" ⇄ YearMonth, used in URL search params. */
export function parseYearMonth(value: string | undefined | null): YearMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Human formatting of a LocalDate. Formats in UTC so the date never shifts. */
export function formatLocalDate(
  value: LocalDate,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(localDateToDb(value));
}

export function formatYearMonthLabel(value: YearMonth, locale = "en-US"): string {
  return formatLocalDate(makeLocalDate(value.year, value.month, 1), locale, { month: "long", year: "numeric" });
}
