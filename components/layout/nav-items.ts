import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  House,
  Landmark,
  PiggyBank,
  Receipt,
  Repeat,
  Settings,
  Target,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** SPEC §8 desktop sidebar. */
export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Обзор", icon: House },
  { href: "/transactions", label: "Операции", icon: ArrowLeftRight },
  { href: "/debts", label: "Долги", icon: Landmark },
  { href: "/payments", label: "Платежи", icon: Receipt },
  { href: "/subscriptions", label: "Подписки", icon: Repeat },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/accounts", label: "Счета", icon: Wallet },
  { href: "/budgets", label: "Бюджеты", icon: PiggyBank },
  { href: "/goals", label: "Цели", icon: Target },
  { href: "/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/settings", label: "Настройки", icon: Settings },
];

/** SPEC §8 mobile bottom navigation (the centre slot is Quick Add). */
export const MOBILE_NAV: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { href: "/dashboard", label: "Главная", icon: House },
    { href: "/transactions", label: "Операции", icon: ArrowLeftRight },
  ],
  right: [{ href: "/debts", label: "Долги", icon: Landmark }],
};

export const MORE_NAV: NavItem[] = MAIN_NAV.filter(
  (item) => !["/dashboard", "/transactions", "/debts"].includes(item.href),
);

/** Shown only to admins (ADMIN_EMAILS), after the main items. */
export const ADMIN_NAV: NavItem = { href: "/admin", label: "Админ", icon: ShieldCheck };

export const ACCOUNT_ICON = CreditCard;

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
