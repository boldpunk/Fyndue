"use client";
import { Camera, FileText, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { deleteReceiptAction, uploadReceiptAction } from "@/app/(app)/transactions/receipt-actions";
import { Button } from "@/components/ui/button";
import { toastActionError } from "@/lib/utils/action-toast";

type Receipt = { id: string; name: string; mimeType: string };

/** Receipt photos / PDFs of one operation: shoot or pick a file, open, delete. */
export function TransactionReceipts({ transactionId, receipts, max }: { transactionId: string; receipts: Receipt[]; max: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const upload = (file: File) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("file", file);
      data.set("transactionId", transactionId);
      const result = await uploadReceiptAction(data);
      if (!result.ok) return void toast.error(result.fieldErrors?.file ?? result.error);
      toast.success("Чек прикреплён");
      router.refresh();
    });

  const remove = (receipt: Receipt) =>
    startTransition(async () => {
      const result = await deleteReceiptAction({ id: receipt.id, transactionId });
      if (!result.ok) return void toastActionError(result);
      toast.success("Чек удалён");
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      {receipts.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {receipts.map((r) => (
            <div key={r.id} className="group relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
              <a href={`/api/documents/${r.id}`} target="_blank" rel="noopener" className="block size-full" title={r.name}>
                {r.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private, session-checked file
                  <img src={`/api/documents/${r.id}`} alt={r.name} className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center gap-1 p-2 text-center text-xs text-muted-foreground">
                    <FileText className="size-6" aria-hidden />
                    <span className="line-clamp-2 break-all">{r.name}</span>
                  </span>
                )}
              </a>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label={`Удалить «${r.name}»`}
                disabled={pending}
                onClick={() => remove(r)}
                className="absolute top-1 right-1 opacity-90"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Сфотографируйте чек или прикрепите PDF — он будет храниться вместе с операцией.</p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      {receipts.length < max ? (
        <Button variant="outline" className="w-fit" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? <Loader2 className="animate-spin" /> : <Camera />} {receipts.length > 0 ? "Добавить ещё" : "Прикрепить чек"}
        </Button>
      ) : null}
    </div>
  );
}
