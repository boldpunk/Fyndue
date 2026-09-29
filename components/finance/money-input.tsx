"use client";
import { forwardRef, type ComponentProps } from "react";
import { formatMoney, parseMoneyInput } from "@/lib/finance/money";
import { cn } from "@/lib/utils/cn";
import { inputClassName } from "@/components/ui/input";

type MoneyInputProps = Omit<ComponentProps<"input">, "type" | "inputMode" | "value" | "onChange" | "size"> & {
  value: string;
  onChange: (value: string) => void;
  currency?: string;
  allowNegative?: boolean;
  size?: "default" | "lg";
};

/**
 * Amount entry that never converts to a JS number. The raw text is kept and
 * validated by the shared zod schema; on blur it is regrouped for legibility
 * ("3500000" → "3,500,000").
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, currency, allowNegative, size = "default", className, onBlur, ...props },
  ref,
) {
  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const raw = value.trim();
          const negative = allowNegative && /^[-−]/.test(raw);
          const parsed = parseMoneyInput(negative ? raw.slice(1) : raw);
          if (parsed && parsed.decimalPlaces() <= 2) {
            const grouped = formatMoney(parsed.toString(), "", { hideCurrency: true });
            onChange(negative ? `-${grouped}` : grouped);
          }
          onBlur?.(e);
        }}
        className={cn(
          inputClassName,
          "tabular",
          currency && "pr-14",
          size === "lg" && "h-14 text-2xl font-semibold tracking-tight md:text-2xl",
          className,
        )}
        {...props}
      />
      {currency ? (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-medium text-muted-foreground">
          {currency}
        </span>
      ) : null}
    </div>
  );
});
