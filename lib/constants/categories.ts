/**
 * Category icon and colour allow-lists. User input is validated against these
 * keys, so no arbitrary CSS or markup can be stored (docs/security.md §3).
 */

export const CATEGORY_ICONS = [
  "fuel",
  "car-taxi-front",
  "shopping-cart",
  "utensils",
  "shopping-bag",
  "car",
  "house",
  "zap",
  "wifi",
  "smartphone",
  "clapperboard",
  "plane",
  "heart-pulse",
  "graduation-cap",
  "repeat",
  "gift",
  "landmark",
  "briefcase",
  "laptop",
  "trophy",
  "banknote",
  "undo-2",
  "wallet",
  "piggy-bank",
  "baby",
  "dumbbell",
  "paw-print",
  "shirt",
  "coffee",
  "circle-dashed",
] as const;
export type CategoryIconKey = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "teal",
  "sky",
  "blue",
  "indigo",
  "violet",
  "pink",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export type DefaultCategory = {
  name: string;
  icon: CategoryIconKey;
  color: CategoryColor;
  isSystem?: boolean;
};

/** SPEC §27. "Debt Payments" is a system category used by the debt engine. */
export const DEFAULT_EXPENSE_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Fuel", icon: "fuel", color: "orange" },
  { name: "Taxi", icon: "car-taxi-front", color: "amber" },
  { name: "Groceries", icon: "shopping-cart", color: "green" },
  { name: "Restaurants", icon: "utensils", color: "red" },
  { name: "Shopping", icon: "shopping-bag", color: "pink" },
  { name: "Car", icon: "car", color: "slate" },
  { name: "Home", icon: "house", color: "teal" },
  { name: "Utilities", icon: "zap", color: "amber" },
  { name: "Internet", icon: "wifi", color: "sky" },
  { name: "Mobile", icon: "smartphone", color: "blue" },
  { name: "Entertainment", icon: "clapperboard", color: "violet" },
  { name: "Travel", icon: "plane", color: "sky" },
  { name: "Health", icon: "heart-pulse", color: "red" },
  { name: "Education", icon: "graduation-cap", color: "indigo" },
  { name: "Subscriptions", icon: "repeat", color: "violet" },
  { name: "Gifts", icon: "gift", color: "pink" },
  { name: "Debt Payments", icon: "landmark", color: "indigo", isSystem: true },
  { name: "Other", icon: "circle-dashed", color: "slate" },
];

/** SPEC §28 income sources. */
export const DEFAULT_INCOME_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Salary", icon: "briefcase", color: "green" },
  { name: "Freelance", icon: "laptop", color: "teal" },
  { name: "Bonus", icon: "trophy", color: "amber" },
  { name: "Cash", icon: "banknote", color: "lime" },
  { name: "Refund", icon: "undo-2", color: "sky" },
  { name: "Other", icon: "circle-dashed", color: "slate" },
];

export const DEBT_PAYMENTS_CATEGORY_NAME = "Debt Payments";
