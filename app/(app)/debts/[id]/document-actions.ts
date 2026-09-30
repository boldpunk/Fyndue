"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents/files";
import { deleteDocument, updateDocument, uploadDocument } from "@/lib/services/documents";
import { runAction } from "@/lib/utils/action";
import { documentUpdateSchema, documentUploadSchema } from "@/lib/validations/documents";

export async function uploadDocumentAction(formData: FormData) {
  return runAction(async () => {
    const user = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new DomainError("Choose a file to upload.", "VALIDATION", { file: "Choose a PDF, JPG or PNG file." });
    }
    if (file.size > MAX_DOCUMENT_BYTES) throw new DomainError("Files can be up to 10 MB.", "VALIDATION", { file: "Files can be up to 10 MB." });
    const meta = documentUploadSchema.parse({
      debtId: formData.get("debtId"),
      debtPaymentId: formData.get("debtPaymentId") ?? undefined,
      type: formData.get("type"),
      name: formData.get("name") || undefined,
    });
    const result = await uploadDocument(user.id, { ...meta, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath(`/debts/${meta.debtId}`);
    return result;
  });
}

export async function updateDocumentAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateDocument(user.id, documentUpdateSchema.parse(input));
    revalidatePath("/debts/[id]", "page");
    return null;
  });
}

export async function deleteDocumentAction(id: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    if (typeof id !== "string" || !id) throw new DomainError("Document not found.");
    await deleteDocument(user.id, id);
    revalidatePath("/debts/[id]", "page");
    return null;
  });
}
