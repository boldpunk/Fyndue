import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/finance/empty-state";
import { PageHeader } from "./page-header";

/** Placeholder for sections scheduled in later phases (docs/roadmap.md). */
export function ComingSoon({
  title,
  icon,
  phase,
  description,
}: {
  title: string;
  icon: LucideIcon;
  phase: string;
  description: string;
}) {
  return (
    <div className="grid gap-6">
      <PageHeader title={title} />
      <EmptyState icon={icon} title={`Arrives in ${phase}`} description={description} />
    </div>
  );
}
