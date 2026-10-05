"use client";
import { Check, Crown, MoreHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { decideProRequestAction, grantProAction, revokeProAction } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toastActionError } from "@/lib/utils/action-toast";

/** Confirm / reject a «Я оплатил» request. */
export function ProRequestButtons({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const decide = (approve: boolean) =>
    startTransition(async () => {
      if (!approve && !window.confirm(`Отклонить заявку ${name}? Пользователь получит сообщение, что оплата не найдена.`)) return;
      const result = await decideProRequestAction({ id, approve });
      if (!result.ok) return void toastActionError(result);
      toast.success(approve ? `Pro для ${name} включён` : "Заявка отклонена");
      router.refresh();
    });
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => decide(true)}>
        <Check /> Оплата пришла
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(false)}>
        <X /> Нет оплаты
      </Button>
    </div>
  );
}

/** Per-user menu: give or take away Pro. */
export function ProUserMenu({ userId, name, paid }: { userId: string; name: string; paid: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const grant = (days: number) =>
    startTransition(async () => {
      const result = await grantProAction({ userId, days });
      if (!result.ok) return void toastActionError(result);
      toast.success(`${name}: Pro продлён на ${days} дн.`);
      router.refresh();
    });
  const custom = () => {
    const raw = window.prompt(`На сколько дней выдать Pro для ${name}?`, "7");
    const days = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isInteger(days) && days > 0) grant(days);
  };
  const revoke = () =>
    startTransition(async () => {
      if (!window.confirm(`Забрать оплаченный Pro у ${name}?`)) return;
      const result = await revokeProAction(userId);
      if (!result.ok) return void toastActionError(result);
      toast.success(`${name}: Pro отключён`);
      router.refresh();
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Pro для ${name}`} disabled={pending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => grant(30)}>
          <Crown /> +1 месяц Pro
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => grant(365)}>
          <Crown /> +1 год Pro
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={custom}>
          <Crown /> Другой срок…
        </DropdownMenuItem>
        {paid ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={revoke}>
              <X /> Забрать Pro
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
