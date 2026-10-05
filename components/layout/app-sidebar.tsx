"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Logo } from "./logo";
import { ADMIN_NAV, MAIN_NAV, isActive } from "./nav-items";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";
import { UserBadge } from "./user-badge";

export function AppSidebar({ user }: { user: { name: string; contact: string; isAdmin: boolean } }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 lg:flex">
      <Link href="/dashboard" className="mb-6 px-2">
        <Logo />
      </Link>
      <nav aria-label="Основное" className="grid gap-0.5">
        {(user.isAdmin ? [...MAIN_NAV, ADMIN_NAV] : MAIN_NAV).map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                active ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-0.5 border-t pt-3">
        <UserBadge name={user.name} email={user.contact} />
        <ThemeToggle withLabel />
        <SignOutButton />
      </div>
    </aside>
  );
}
