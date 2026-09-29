import { Money } from "./money";

/**
 * Per-currency totals, largest first by currency order given. Different
 * currencies are listed separately — never summed (SPEC §46).
 */
export function CurrencyTotals({
  totals,
  primaryCurrency,
  emptyLabel = "—",
  tone,
}: {
  totals: { currency: string; amount: string }[];
  primaryCurrency: string;
  emptyLabel?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  if (totals.length === 0) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }
  const sorted = [...totals].sort((a, b) =>
    a.currency === primaryCurrency ? -1 : b.currency === primaryCurrency ? 1 : a.currency.localeCompare(b.currency),
  );
  const [first, ...rest] = sorted;
  return (
    <>
      <Money amount={first!.amount} currency={first!.currency} tone={tone} />
      {rest.map((t) => (
        <Money key={t.currency} amount={t.amount} currency={t.currency} tone={tone} className="text-sm font-medium text-muted-foreground" />
      ))}
    </>
  );
}
