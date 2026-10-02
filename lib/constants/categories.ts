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

/** SPEC §27. «Платежи по долгам» is a system category used by the debt engine (found by isSystem, not by name). */
export const DEFAULT_EXPENSE_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Топливо", icon: "fuel", color: "orange" },
  { name: "Такси", icon: "car-taxi-front", color: "amber" },
  { name: "Продукты", icon: "shopping-cart", color: "green" },
  { name: "Кафе и рестораны", icon: "utensils", color: "red" },
  { name: "Покупки", icon: "shopping-bag", color: "pink" },
  { name: "Автомобиль", icon: "car", color: "slate" },
  { name: "Дом", icon: "house", color: "teal" },
  { name: "Коммунальные услуги", icon: "zap", color: "amber" },
  { name: "Интернет", icon: "wifi", color: "sky" },
  { name: "Мобильная связь", icon: "smartphone", color: "blue" },
  { name: "Развлечения", icon: "clapperboard", color: "violet" },
  { name: "Путешествия", icon: "plane", color: "sky" },
  { name: "Здоровье", icon: "heart-pulse", color: "red" },
  { name: "Образование", icon: "graduation-cap", color: "indigo" },
  { name: "Подписки", icon: "repeat", color: "violet" },
  { name: "Подарки", icon: "gift", color: "pink" },
  { name: "Платежи по долгам", icon: "landmark", color: "indigo", isSystem: true },
  { name: "Другое", icon: "circle-dashed", color: "slate" },
];

/** SPEC §28 income sources. */
export const DEFAULT_INCOME_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Зарплата", icon: "briefcase", color: "green" },
  { name: "Фриланс", icon: "laptop", color: "teal" },
  { name: "Премия", icon: "trophy", color: "amber" },
  { name: "Наличные", icon: "banknote", color: "lime" },
  { name: "Возврат", icon: "undo-2", color: "sky" },
  { name: "Другое", icon: "circle-dashed", color: "slate" },
];

export const DEBT_PAYMENTS_CATEGORY_NAME = "Платежи по долгам";
