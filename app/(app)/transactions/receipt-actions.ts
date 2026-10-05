"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents/files";
import { deleteDocument, uploadTransactionReceipt } from "@/lib/services/documents";
import { runAction } from "@/lib/utils/action";
import { z } from "zod";
import { idSchema } from "@/lib/validations/common";

export async function uploadReceiptAction(formData: FormData) {
  return runAction(async () => {
    const user = await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("Выберите фото или PDF чека.", "VALIDATION", { file: "Выберите файл" });
    if (file.size > MAX_DOCUMENT_BYTES) throw new DomainError("Файл должен быть не больше 10 МБ.", "VALIDATION", { file: "Не больше 10 МБ" });
    const transactionId = idSchema.parse(formData.get("transactionId"));
    const result = await uploadTransactionReceipt(user.id, { transactionId, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath(`/transactions/${transactionId}`);
    return result;
  });
}

export async function deleteReceiptAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { id, transactionId } = z.object({ id: idSchema, transactionId: idSchema }).parse(input);
    await deleteDocument(user.id, id);
    revalidatePath(`/transactions/${transactionId}`);
    return null;
  });
}
