import { toast } from "sonner";
import type { ActionResult } from "./action-result";

type Failure = Extract<ActionResult<unknown>, { ok: false }>;

/** A failed action as a toast; a Free limit gets a «Подключить Pro» button. */
export function toastActionError(result: Failure) {
  if (result.code === "PRO_REQUIRED") {
    toast.error(result.error, { duration: 8000, action: { label: "Подключить Pro", onClick: () => window.location.assign(new URL("/pro", window.location.href)) } });
  } else {
    toast.error(result.error);
  }
}

/** For forms that show errors inline: also offer Pro when that is the reason. */
export function offerPro(result: Failure) {
  if (result.code === "PRO_REQUIRED") toastActionError(result);
}
