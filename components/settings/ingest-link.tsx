"use client";
import { Copy, Link2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createIngestLinkAction, revokeIngestLinkAction } from "@/app/(app)/settings/auto-import/actions";
import { Button } from "@/components/ui/button";
import { toastActionError } from "@/lib/utils/action-toast";

/** The personal link is shown once, right after it is made; only its hash is stored. */
export function IngestLink({ hasLink }: { hasLink: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      if (hasLink && !window.confirm("Создать новую ссылку? Старая перестанет работать — обновите её в автоматизации на телефоне.")) return;
      const result = await createIngestLinkAction();
      if (!result.ok) return void toastActionError(result);
      setUrl(result.data.url);
      router.refresh();
    });
  const revoke = () =>
    startTransition(async () => {
      if (!window.confirm("Отключить ссылку? Автоматизация на телефоне перестанет записывать операции.")) return;
      const result = await revokeIngestLinkAction();
      if (!result.ok) return void toastActionError(result);
      setUrl(null);
      toast.success("Ссылка отключена");
      router.refresh();
    });

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      {url ? (
        <>
          <p className="text-[13px] text-warning">Скопируйте сейчас — ссылка показывается один раз. Никому её не передавайте.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{url}</code>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success("Скопировано"))}>
              <Copy /> Копировать
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">{hasLink ? "Ссылка создана и работает." : "Ссылки пока нет."}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={create} disabled={pending}>
          {hasLink ? <RefreshCw /> : <Link2 />} {hasLink ? "Новая ссылка" : "Создать ссылку"}
        </Button>
        {hasLink ? (
          <Button size="sm" variant="ghost" className="text-danger" onClick={revoke} disabled={pending}>
            <Trash2 /> Отключить
          </Button>
        ) : null}
      </div>
    </div>
  );
}
