import { formatPercent } from "@/lib/finance/money";
import { cn } from "@/lib/utils/cn";

/** Accessible progress bar; the percentage is also rendered as text by callers. */
export function ProgressBar({
  percent,
  label,
  tone = "primary",
  className,
}: {
  /** "30.56" — a decimal string, clamped to 0–100 for display. */
  percent: string;
  label: string;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const value = Math.min(100, Math.max(0, Number.parseFloat(percent) || 0));
  const bar = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuetext={formatPercent(percent)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {/* Display only — the figure itself comes from lib/finance. */}
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", bar)} style={{ width: `${value}%` }} />
    </div>
  );
}
