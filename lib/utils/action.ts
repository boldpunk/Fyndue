import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { DomainError } from "@/lib/errors";
import type { ActionResult } from "./action-result";

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * Runs a server action body and converts failures into a typed, sanitised
 * result. Only DomainError messages reach the client; anything unexpected is
 * logged server-side (without payloads) and replaced by a generic message.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ZodError) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: zodFieldErrors(error) };
    }
    if (error instanceof DomainError) {
      return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[action-error ${reference}]`, error instanceof Error ? error.name : "UnknownError", error instanceof Error ? error.message.split("\n")[0] : "");
    return { ok: false, error: `Something went wrong. Please try again (ref ${reference}).` };
  }
}
