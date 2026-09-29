import { formatMoney, money, type MoneyFormatOptions } from "@/lib/finance/money";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "auto" | "positive" | "negative" | "muted";

/**
 * Formatted amount with tabular figures. Takes the amount as a decimal
 * string (never a JS number) and formats it only — no arithmetic here.
 */
export function Money({
  amount,
  currency,
  tone = "neutral",
  className,
  ...options
}: {
  amount: string;
  currency: string;
  tone?: Tone;
  className?: string;
} & MoneyFormatOptions) {
  const value = money(amount);
  const toneClass =
    tone === "positive" || (tone === "auto" && value.isPositive() && !value.isZero())
      ? "text-success"
      : tone === "negative" || (tone === "auto" && value.isNegative())
        ? "text-danger"
        : tone === "muted"
          ? "text-muted-foreground"
          : undefined;
  return (
    <span className={cn("tabular whitespace-nowrap", toneClass, className)}>
      {formatMoney(amount, currency, options)}
    </span>
  );
}
