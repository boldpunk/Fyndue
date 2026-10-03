/**
 * Bank working days in Uzbekistan (pure). A payment due on a weekend or a
 * public holiday moves to the next working day; interest is still counted
 * to the original date, as banks do (see the schedule engine).
 *
 * Fixed public holidays from the Labour Code. Ramazon and Qurbon hayit
 * follow the lunar calendar and are announced each year, so they are not
 * listed: a line that falls on one can be moved in the schedule editor.
 */
import { addDays, parseLocalDate, weekday, type LocalDate } from "./dates";

/** "MM-DD" of the fixed public holidays: New Year, 8 March, Navruz, Victory Day, Independence Day, Teachers' Day, Constitution Day. */
export const UZ_FIXED_HOLIDAYS = ["01-01", "03-08", "03-21", "05-09", "09-01", "10-01", "12-08"] as const;

export function isBankHoliday(date: LocalDate): boolean {
  const { month, day } = parseLocalDate(date);
  const key = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return (UZ_FIXED_HOLIDAYS as readonly string[]).includes(key);
}

export function isBusinessDay(date: LocalDate): boolean {
  const d = weekday(date);
  return d !== 0 && d !== 6 && !isBankHoliday(date);
}

/** The date itself if it is a working day, else the next working day. */
export function nextBusinessDay(date: LocalDate): LocalDate {
  let d = date;
  for (let guard = 0; !isBusinessDay(d) && guard < 14; guard++) d = addDays(d, 1);
  return d;
}

/** Due date for a nominal schedule date: moved to a working day when `shift` is on. */
export function adjustDueDate(nominal: LocalDate, shift: boolean | undefined): LocalDate {
  return shift ? nextBusinessDay(nominal) : nominal;
}
