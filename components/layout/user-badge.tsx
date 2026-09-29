import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function UserBadge({ name, email, className }: { name: string; email: string; className?: string }) {
  return (
    <Link href="/settings" className={cn("flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted", className)}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
        {initials(name)}
      </span>
      <span className="grid min-w-0 text-left leading-tight">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </span>
    </Link>
  );
}
