import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  House,
  Landmark,
  PiggyBank,
  Receipt,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** SPEC §8 desktop sidebar. */
export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: House },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/debts", label: "Debts", icon: Landmark },
  { href: "/payments", label: "Payments", icon: Receipt },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** SPEC §8 mobile bottom navigation (the centre slot is Quick Add). */
export const MOBILE_NAV: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { href: "/dashboard", label: "Home", icon: House },
    { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  ],
  right: [{ href: "/debts", label: "Debts", icon: Landmark }],
};

export const MORE_NAV: NavItem[] = MAIN_NAV.filter(
  (item) => !["/dashboard", "/transactions", "/debts"].includes(item.href),
);

export const ACCOUNT_ICON = CreditCard;

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
