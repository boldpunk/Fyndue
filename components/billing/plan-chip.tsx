import { Crown, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export type PlanChipData = { tier: "pro" | "free"; reason: "paid" | "trial" | "admin" | null; until: string | null; daysLeft: number | null };

const short = (iso: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(iso)).replace(".", "");

/** The plan in the sidebar: Pro until…, trial days left, or an invitation to Pro. */
export function PlanChip({ plan, onNavigate }: { plan: PlanChipData; onNavigate?: () => void }) {
  const ending = plan.reason === "trial" && (plan.daysLeft ?? 0) <= 3;
  const text =
    plan.tier === "free"
      ? "Перейти на Pro"
      : plan.reason === "admin"
        ? "Pro"
        : plan.reason === "trial"
          ? `Пробный Pro · ${plan.daysLeft} дн.`
          : `Pro до ${short(plan.until!)}`;
  return (
    <Link
      href="/pro"
      onClick={onNavigate}
      className={cn(
        "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
        plan.tier === "free" || ending ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-primary hover:bg-primary-subtle",
      )}
    >
      {plan.tier === "free" ? <Sparkles className="size-4" aria-hidden /> : <Crown className="size-4" aria-hidden />}
      {text}
    </Link>
  );
}
