import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ChangeDTO } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils/cn";
import { formatPercent } from "@/lib/finance/money";

/**
 * "+20,0% к прошлому месяцу". Direction is shown by arrow + sign + text, never
 * colour alone. `goodWhen` sets which direction is favourable.
 */
export function MonthChange({ change, goodWhen }: { change: ChangeDTO; goodWhen: "up" | "down" }) {
  if (!change) return null;
  const up = !change.delta.startsWith("-") && change.delta !== "0.00";
  const flat = change.delta === "0.00";
  const good = flat ? null : (up && goodWhen === "up") || (!up && goodWhen === "down");
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const label = change.percent === null ? (flat ? "Без изменений" : up ? "Рост с нуля" : "Снижение") : `${up && !flat ? "+" : ""}${formatPercent(change.percent)}`;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", good === true && "text-success", good === false && "text-warning")}>
      <Icon className="size-3.5" aria-hidden />
      {label}
      <span className="font-normal text-muted-foreground">&nbsp;к прошлому месяцу</span>
    </span>
  );
}
