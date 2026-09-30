/**
 * Pure file checks for documents (SPEC §41). The type is decided from the
 * file's own bytes, never from its name or the browser's Content-Type, so a
 * renamed HTML/SVG file can never be stored or served as a document.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

const EXTENSION: Record<DocumentMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);
}

export function sniffFileType(bytes: Uint8Array): DocumentMimeType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

export function extensionFor(mimeType: string): string {
  return EXTENSION[mimeType as DocumentMimeType] ?? "bin";
}

export const MAX_NAME_LENGTH = 120;

/** A safe display name from an uploaded file name: no path, no control or bidi characters, no extension. */
export function displayName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\.(pdf|jpe?g|png)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Document").slice(0, MAX_NAME_LENGTH);
}

/** RFC 6266 header with an ASCII fallback and the exact UTF-8 name. */
export function contentDisposition(name: string, mimeType: string, mode: "inline" | "attachment"): string {
  const file = `${name}.${extensionFor(mimeType)}`;
  const ascii = file.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(file).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
