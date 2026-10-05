import { describe, expect, it } from "vitest";
import { formatPhone, isPhoneAccountEmail, normalizePhone, phoneAccountEmail } from "@/lib/auth/phone";

describe("phone numbers", () => {
  it("normalises the usual ways of typing an Uzbek number", () => {
    for (const input of ["+998901234567", "+998 90 123-45-67", "998901234567", "90 123 45 67", "(90) 123-45-67", "00998901234567"]) {
      expect(normalizePhone(input), input).toBe("+998901234567");
    }
  });

  it("keeps other countries in E.164 and rejects nonsense", () => {
    expect(normalizePhone("+7 916 123 45 67")).toBe("+79161234567");
    expect(normalizePhone("+99890123456")).toBeNull(); // Uzbek number one digit short
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+998 90 abc")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("formats for display and builds the placeholder email", () => {
    expect(formatPhone("+998901234567")).toBe("+998 90 123 45 67");
    expect(phoneAccountEmail("+998901234567")).toBe("998901234567@phone.fyndue.uz");
    expect(isPhoneAccountEmail("998901234567@phone.fyndue.uz")).toBe(true);
    expect(isPhoneAccountEmail("me@gmail.com")).toBe(false);
  });
});
