import { money, sumMoney, type FinDecimal, type MoneyLike } from "@/lib/finance/money";

/** One level of subcategories («Автомобиль → Парковка»). Pure helpers shared by server and client. */

type Node = { id: string; parentId: string | null };

/** Parents in their order, each followed by its children — the order the picker and settings show. */
export function orderTree<T extends Node>(categories: readonly T[]): T[] {
  const ids = new Set(categories.map((c) => c.id));
  const roots = categories.filter((c) => !c.parentId || !ids.has(c.parentId));
  return roots.flatMap((root) => [root, ...categories.filter((c) => c.parentId === root.id)]);
}

/** Sums each row into its top-level category: a parking expense counts towards «Автомобиль». */
export function rollUpToParents(
  rows: readonly { categoryId: string | null; amount: MoneyLike }[],
  categories: readonly Node[],
): Map<string | null, FinDecimal> {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const totals = new Map<string | null, FinDecimal[]>();
  for (const row of rows) {
    const parent = row.categoryId ? parentOf.get(row.categoryId) : null;
    const key = parent && parentOf.has(parent) ? parent : row.categoryId;
    totals.set(key, [...(totals.get(key) ?? []), money(row.amount)]);
  }
  return new Map([...totals].map(([k, v]) => [k, sumMoney(v)]));
}
