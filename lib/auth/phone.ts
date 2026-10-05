/**
 * Phone numbers for sign-in, normalised to E.164 ("+998901234567"). Pure.
 * Nine digits are taken as an Uzbek number without the country code.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[\s()\-.]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  let d = digits.replace(/^\+/, "");
  if (!digits.startsWith("+") && d.length === 9) d = `998${d}`;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 10 || d.length > 15 || d.startsWith("0")) return null;
  // Uzbekistan: +998 and exactly 9 digits after it.
  if (d.startsWith("998") && d.length !== 12) return null;
  return `+${d}`;
}

export function isNormalizedPhone(value: string): boolean {
  return normalizePhone(value) === value;
}

/** "+998 90 123 45 67" for display. */
export function formatPhone(e164: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

/** Placeholder email Better Auth requires for phone-only accounts; never mailed. */
export function phoneAccountEmail(e164: string): string {
  return `${e164.slice(1)}@phone.fyndue.uz`;
}

export function isPhoneAccountEmail(email: string): boolean {
  return email.endsWith("@phone.fyndue.uz");
}
