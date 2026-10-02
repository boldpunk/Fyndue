"use client";
import { Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";
import { MOBILE_NAV, MORE_NAV, isActive, type NavItem } from "./nav-items";
import { useQuickAdd } from "./quick-add";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";
import { UserBadge } from "./user-badge";

function Tab({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
    >
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}

export function MobileNav({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const quickAdd = useQuickAdd();
  const moreActive = MORE_NAV.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav aria-label="Основное" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-safe backdrop-blur lg:hidden">
        <div className="flex h-16 items-stretch">
          {MOBILE_NAV.left.map((item) => (
            <Tab key={item.href} item={item} pathname={pathname} />
          ))}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => quickAdd.open()}
              className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95"
            >
              <Plus className="size-6" aria-hidden />
              <span className="sr-only">Добавить операцию</span>
            </button>
          </div>
          {MOBILE_NAV.right.map((item) => (
            <Tab key={item.href} item={item} pathname={pathname} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium", moreActive ? "text-primary" : "text-muted-foreground")}
          >
            <Menu className="size-5" aria-hidden />
            Ещё
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Ещё</SheetTitle>
            <SheetDescription className="sr-only">Другие разделы Fyndue</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2">
            {MORE_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium",
                  isActive(pathname, href) ? "border-primary/40 bg-primary-subtle text-primary" : "bg-card",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
          <div className="grid gap-0.5 border-t pt-3">
            <UserBadge name={user.name} email={user.email} />
            <ThemeToggle withLabel />
            <SignOutButton />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
