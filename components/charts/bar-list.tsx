import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/finance/money";

/**
 * Horizontal bars for a ranked breakdown (expenses by category). One series,
 * so one hue for every bar (slot 1) — rank is shown by length, not colour.
 * Every value is labelled directly, so the list doubles as its own table.
 * The share is used only for bar length.
 */
export function BarList({
  title,
  description,
  rows,
  currency,
}: {
  title: string;
  description?: string;
  rows: { key: string; label: string; icon?: string | null; color?: string | null; amount: string; share: string }[];
  currency: string;
}) {
  // Rows arrive already ranked, with any tail folded into "Other" by the service.
  const list = rows;
  const top = Math.max(...list.map((r) => Number(r.share)), 1);

  return (
    <figure className="grid gap-3">
      <figcaption className="grid gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </figcaption>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No spending in this period</p>
      ) : (
        <ul className="grid gap-3">
          {list.map((r) => (
            <li key={r.key} className="grid gap-1.5">
              <div className="flex items-center gap-2 text-sm">
                {r.icon ? <CategoryIcon icon={r.icon} color={r.color} size="sm" /> : <span className="size-7" aria-hidden />}
                <span className="flex-1 truncate">{r.label}</span>
                <Money amount={r.amount} currency={currency} className="font-medium" />
                <span className="tabular w-12 text-right text-xs text-muted-foreground">{r.share}%</span>
              </div>
              <div className="ml-9 h-2 overflow-hidden rounded-r-[4px] bg-muted" aria-hidden>
                <div className="h-full rounded-r-[4px] bg-viz-1" style={{ width: `${(Number(r.share) / top) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
