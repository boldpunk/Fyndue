import { Banknote, CreditCard, Landmark, PiggyBank, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CATEGORY_COLOR_CLASSES } from "@/components/finance/category-icon";
import { Money } from "@/components/finance/money";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CategoryColor } from "@/lib/constants/categories";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants/finance";
import type { AccountDTO } from "@/lib/services/accounts";
import { cn } from "@/lib/utils/cn";

export const ACCOUNT_TYPE_ICONS: Record<AccountDTO["type"], LucideIcon> = {
  BANK_CARD: CreditCard,
  CASH: Banknote,
  SAVINGS: PiggyBank,
  DEPOSIT: Landmark,
  DIGITAL_WALLET: Smartphone,
  OTHER: Wallet,
};

export function AccountIcon({ account, className }: { account: Pick<AccountDTO, "type" | "color">; className?: string }) {
  const Icon = ACCOUNT_TYPE_ICONS[account.type];
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", CATEGORY_COLOR_CLASSES[(account.color ?? "indigo") as CategoryColor], className)}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

export function AccountCard({ account }: { account: AccountDTO }) {
  return (
    <Link href={`/accounts/${account.id}`} className="group rounded-xl focus-visible:outline-2">
      <Card className={cn("grid gap-5 p-5 transition-shadow group-hover:shadow-md", account.isArchived && "opacity-70")}>
        <div className="flex items-start justify-between gap-3">
          <AccountIcon account={account} />
          <div className="flex flex-wrap justify-end gap-1">
            {!account.includeInTotal ? <Badge>Не входит в общий баланс</Badge> : null}
            {account.isArchived ? <Badge>В архиве</Badge> : null}
          </div>
        </div>
        <div className="grid gap-1">
          <p className="truncate text-sm text-muted-foreground">
            {account.name}
            {account.bank ? ` · ${account.bank}` : ""}
          </p>
          <Money
            amount={account.currentBalance}
            currency={account.currency}
            tone={account.currentBalance.startsWith("-") ? "negative" : "neutral"}
            className="text-xl font-semibold tracking-tight"
          />
          <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[account.type]}</p>
        </div>
      </Card>
    </Link>
  );
}
