import { z } from "zod";
import { MAX_NAME_LENGTH } from "@/lib/documents/files";
import { idSchema } from "./common";

export const DOCUMENT_TYPES = ["LOAN_AGREEMENT", "PAYMENT_RECEIPT", "BANK_SCHEDULE", "OTHER"] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v : undefined))
  .pipe(idSchema.optional());

/** Metadata sent with an upload; the file itself is checked by the service. */
export const documentUploadSchema = z.object({
  debtId: idSchema,
  debtPaymentId: optionalId,
  type: documentTypeSchema,
  name: z.string().trim().max(MAX_NAME_LENGTH, `At most ${MAX_NAME_LENGTH} characters`).optional(),
});
export type DocumentUploadInput = z.output<typeof documentUploadSchema>;

export const documentUpdateSchema = z.object({
  id: idSchema,
  type: documentTypeSchema,
  name: z.string().trim().min(1, "Name is required").max(MAX_NAME_LENGTH, `At most ${MAX_NAME_LENGTH} characters`),
  debtPaymentId: optionalId,
});
export type DocumentUpdateInput = z.output<typeof documentUpdateSchema>;
