"use client";
import { UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeShareAction, shareAccountAction } from "@/app/(app)/accounts/shared-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountMemberDTO } from "@/lib/services/shared-accounts";

/** Owner's card on the account page: who else can use this account, invite, remove. */
export function AccountSharing({ accountId, members, max }: { accountId: string; members: AccountMemberDTO[]; max: number }) {
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const invite = () =>
    startTransition(async () => {
      setError(null);
      const result = await shareAccountAction({ accountId, contact });
      if (!result.ok) return setError(result.error);
      toast.success("Доступ открыт");
      setContact("");
      router.refresh();
    });

  const remove = (m: AccountMemberDTO) =>
    startTransition(async () => {
      const result = await removeShareAction(m.shareId);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`${m.name} больше не видит этот счёт`);
      router.refresh();
    });

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Например, семейная карта: близкий человек увидит баланс и операции <b>только этого счёта</b> и сможет добавлять расходы и доходы — они попадут к вам. Остальные ваши счета, долги и
        аналитика ему не видны.
      </p>
      {members.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {members.map((m) => (
            <li key={m.shareId} className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-primary-subtle text-sm font-semibold text-primary">{m.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{m.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{m.contact}</span>
              </span>
              <Button variant="ghost" size="icon-sm" aria-label={`Убрать доступ у ${m.name}`} disabled={pending} onClick={() => remove(m)}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {members.length < max ? (
        <form
          noValidate
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <div className="flex gap-2">
            <Input
              aria-label="Телефон или email"
              placeholder="+998 90 123 45 67 или email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              autoComplete="off"
              aria-invalid={Boolean(error) || undefined}
            />
            <Button type="submit" disabled={pending || contact.trim().length < 3}>
              <UserPlus /> Пригласить
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">У человека уже должен быть аккаунт в Fyndue. Если подключён бот, придёт сообщение.</p>
          )}
        </form>
      ) : null}
    </div>
  );
}
