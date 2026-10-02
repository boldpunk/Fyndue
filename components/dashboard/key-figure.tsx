import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

/**
 * One of the four answers at the top of the dashboard (SPEC §2): a question,
 * one large figure and a plain-language explanation. The whole card links
 * to where the figure comes from.
 */
export function KeyFigure({
  question,
  icon: Icon,
  tone = "neutral",
  href,
  children,
  footer,
}: {
  question: string;
  icon: LucideIcon;
  tone?: "neutral" | "primary" | "success" | "danger" | "warning";
  href: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const iconTone = {
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary-subtle text-primary",
    success: "bg-success-subtle text-success",
    danger: "bg-danger-subtle text-danger",
    warning: "bg-warning-subtle text-warning",
  }[tone];
  return (
    <Link href={href} className="group rounded-xl focus-visible:outline-2">
      <Card className={cn("flex h-full flex-col gap-3 p-5 transition-shadow group-hover:shadow-md", tone === "danger" && "border-danger/40")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{question}</p>
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", iconTone)}>
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
        <div className="grid min-w-0 gap-1">{children}</div>
        {footer ? <div className="mt-auto text-[13px] text-muted-foreground">{footer}</div> : null}
      </Card>
    </Link>
  );
}
