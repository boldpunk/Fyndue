import {
  Baby,
  Banknote,
  Briefcase,
  Car,
  CarTaxiFront,
  CircleDashed,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  PawPrint,
  PiggyBank,
  Plane,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Trophy,
  Undo2,
  Utensils,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CategoryColor, CategoryIconKey } from "@/lib/constants/categories";
import { cn } from "@/lib/utils/cn";

export const CATEGORY_ICON_COMPONENTS: Record<CategoryIconKey, LucideIcon> = {
  fuel: Fuel,
  "car-taxi-front": CarTaxiFront,
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  "shopping-bag": ShoppingBag,
  car: Car,
  house: House,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  clapperboard: Clapperboard,
  plane: Plane,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  repeat: Repeat,
  gift: Gift,
  landmark: Landmark,
  briefcase: Briefcase,
  laptop: Laptop,
  trophy: Trophy,
  banknote: Banknote,
  "undo-2": Undo2,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  baby: Baby,
  dumbbell: Dumbbell,
  "paw-print": PawPrint,
  shirt: Shirt,
  coffee: Coffee,
  "circle-dashed": CircleDashed,
};

/** Literal class strings so Tailwind can see them. */
export const CATEGORY_COLOR_CLASSES: Record<CategoryColor, string> = {
  slate: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
  red: "bg-red-500/12 text-red-600 dark:text-red-400",
  orange: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  amber: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  lime: "bg-lime-500/14 text-lime-700 dark:text-lime-400",
  green: "bg-green-500/12 text-green-700 dark:text-green-400",
  teal: "bg-teal-500/12 text-teal-700 dark:text-teal-400",
  sky: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  blue: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  indigo: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  pink: "bg-pink-500/12 text-pink-600 dark:text-pink-400",
};

export const CATEGORY_SWATCH_CLASSES: Record<CategoryColor, string> = {
  slate: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  lime: "bg-lime-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = CATEGORY_ICON_COMPONENTS[icon as CategoryIconKey] ?? CircleDashed;
  const colorClass = CATEGORY_COLOR_CLASSES[color as CategoryColor] ?? CATEGORY_COLOR_CLASSES.slate;
  const sizeClass = { sm: "size-7 [&_svg]:size-3.5", md: "size-9 [&_svg]:size-4", lg: "size-11 [&_svg]:size-5" }[size];
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full", sizeClass, colorClass, className)}>
      <Icon />
    </span>
  );
}
