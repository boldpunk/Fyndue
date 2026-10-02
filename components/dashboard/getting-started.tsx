import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export type SetupStep = {
  key: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
};

/**
 * First-run checklist on the dashboard. Steps are derived from real data, so
 * the card disappears by itself once everything is set up.
 */
export function GettingStarted({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 className="font-semibold">С чего начать</h2>
          <p className="text-sm text-muted-foreground">Пара минут — и Fyndue будет показывать полную картину ваших денег.</p>
        </div>
        <span className="text-sm text-muted-foreground">
          Готово <span className="tabular font-medium text-foreground">{done}</span> из {steps.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={s.href}
              aria-disabled={s.done}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                s.done ? "pointer-events-none bg-muted/40" : "bg-card hover:border-primary/40 hover:bg-primary-subtle/40",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  s.done ? "bg-success text-success-foreground" : "bg-primary-subtle text-primary",
                )}
              >
                {s.done ? <Check className="size-4" aria-label="Готово" /> : i + 1}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                <span className="text-[13px] text-muted-foreground">{s.hint}</span>
              </span>
              {s.done ? null : <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
