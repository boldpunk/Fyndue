import { getCurrentUser } from "@/lib/auth/session";
import { contentDisposition } from "@/lib/documents/files";
import { NotFoundError } from "@/lib/errors";
import { readDocument } from "@/lib/services/documents";

/**
 * Private document download (docs/security.md §7). The document is loaded
 * by { id, userId } from the session, so another user's id is a plain 404.
 * `?download=1` saves the file; otherwise PDFs and images open in the browser.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  try {
    const file = await readDocument(user.id, id);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mimeType }), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": contentDisposition(file.name, file.mimeType, download ? "attachment" : "inline"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ETag: `"${file.sha256}"`,
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    throw error;
  }
}
