import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export function FinancialMetricCard({
  label,
  icon: Icon,
  children,
  footer,
  tone = "neutral",
  className,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "neutral" | "success" | "danger" | "primary";
  className?: string;
}) {
  const iconTone = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success-subtle text-success",
    danger: "bg-danger-subtle text-danger",
    primary: "bg-primary-subtle text-primary",
  }[tone];
  return (
    <Card className={cn("flex flex-col gap-3 p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("grid size-8 place-items-center rounded-lg", iconTone)}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="grid gap-0.5 text-2xl font-semibold tracking-tight">{children}</div>
      {footer ? <div className="text-[13px] text-muted-foreground">{footer}</div> : null}
    </Card>
  );
}
