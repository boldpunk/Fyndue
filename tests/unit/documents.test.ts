import { describe, expect, it } from "vitest";
import { contentDisposition, displayName, MAX_DOCUMENT_BYTES, sniffFileType } from "@/lib/documents/files";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (s: string) => new TextEncoder().encode(s);

describe("file type sniffing", () => {
  it("recognises PDF, PNG and JPEG by their magic bytes", () => {
    expect(sniffFileType(ascii("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg");
  });

  it("rejects everything else, whatever the file is called", () => {
    expect(sniffFileType(ascii("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffFileType(ascii("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffFileType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip / docx
    expect(sniffFileType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // gif
    expect(sniffFileType(bytes())).toBeNull();
    expect(sniffFileType(ascii("%PD"))).toBeNull();
  });

  it("limits documents to 10 MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("display names", () => {
  it("keeps readable names and drops paths, control characters and the extension", () => {
    expect(displayName("Loan agreement.pdf")).toBe("Loan agreement");
    expect(displayName("C:\\Users\\me\\Desktop\\scan 01.JPG")).toBe("scan 01");
    expect(displayName("../../etc/passwd")).toBe("passwd");
    expect(displayName("a\u0000b\u202Ec\nd.png")).toBe("abcd");
    expect(displayName("   ")).toBe("Document");
    expect(displayName("x".repeat(300) + ".pdf")).toHaveLength(120);
    expect(displayName("Шартнома №5.pdf")).toBe("Шартнома №5");
  });
});

describe("content disposition", () => {
  it("quotes an ASCII fallback and adds the UTF-8 name", () => {
    expect(contentDisposition("Loan agreement", "application/pdf", "inline")).toBe(
      `inline; filename="Loan agreement.pdf"; filename*=UTF-8''Loan%20agreement.pdf`,
    );
    expect(contentDisposition('Шартнома "5"', "image/jpeg", "attachment")).toBe(
      `attachment; filename="_ _5_.jpg"; filename*=UTF-8''%D0%A8%D0%B0%D1%80%D1%82%D0%BD%D0%BE%D0%BC%D0%B0%20%225%22.jpg`,
    );
  });
});
