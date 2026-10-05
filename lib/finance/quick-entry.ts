import { suggestCategoryIcon } from "@/lib/constants/categories";
import { FinDecimal, parseMoneyInput, toMoneyString } from "./money";

/**
 * One-line entry: «кофе 25к starbucks», «парковка 5000», «+3 млн зарплата»,
 * «такси 40 500 visa», «$12 spotify». Pure: the form applies the result.
 */

export type QuickEntryCategory = { id: string; name: string; type: "EXPENSE" | "INCOME"; icon: string };
export type QuickEntryAccount = { id: string; name: string; currency: string };
export type QuickEntryMerchant = { merchant: string; type: "EXPENSE" | "INCOME"; categoryId: string };

export type QuickEntryResult = {
  kind?: "EXPENSE" | "INCOME";
  /** Decimal string, e.g. "25000.00". */
  amount?: string;
  categoryId?: string;
  accountId?: string;
  merchant?: string;
};

const MULTIPLIERS: Record<string, number> = { к: 1_000, k: 1_000, тыс: 1_000, т: 1_000, млн: 1_000_000, m: 1_000_000, mln: 1_000_000 };
const USD_WORDS = new Set(["$", "usd", "долл", "доллар", "доллара", "долларов"]);
const UZS_WORDS = new Set(["сум", "сума", "сумов", "uzs", "sum", "so'm", "сўм"]);
/** Words that name a default category without being its name. */
const SYNONYMS: [RegExp, string][] = [
  [/^(кофе|кофейн|обед|ужин|завтрак|кафе|ресторан|еда)/, "Кафе и рестораны"],
  [/^(бензин|заправ|метан|пропан|топлив)/, "Топливо"],
  [/^(такси|яндекс|yandex|mytaxi)/, "Такси"],
  [/^(продукт|korzinka|корзинка|makro|макро|havas|хавас|магазин|рынок|базар)/, "Продукты"],
  [/^(аптек|лекарств|врач|клиник)/, "Здоровье"],
  [/^(свет|газ|вода|коммунал)/, "Коммунальные услуги"],
  [/^(интернет|wifi)/, "Интернет"],
  [/^(связь|телефон|beeline|билайн|ucell|uzmobile|mobiuz)/, "Мобильная связь"],
  [/^(зарплат|зп|аванс)/, "Зарплата"],
  [/^(перевод|скинул|скинула|вернул|вернула)/, "Переводы от людей"],
];

const stem = (word: string) => word.toLowerCase().replace(/ё/g, "е").slice(0, Math.max(4, Math.min(word.length, 5)));

function amountToken(token: string): { value: FinDecimal; currency?: "USD" | "UZS" } | null {
  let text = token.toLowerCase();
  let currency: "USD" | "UZS" | undefined;
  if (text.startsWith("$") || text.endsWith("$")) {
    currency = "USD";
    text = text.replace(/\$/g, "");
  }
  const match = /^(\d[\d.,]*)(к|k|тыс|т|млн|m|mln)?\.?$/.exec(text);
  if (!match) return null;
  const base = parseMoneyInput(match[1]!);
  if (!base) return null;
  const multiplier = match[2] ? MULTIPLIERS[match[2]]! : 1;
  return { value: base.mul(multiplier), currency };
}

export function parseQuickEntry(
  input: string,
  options: { categories: QuickEntryCategory[]; accounts: QuickEntryAccount[]; merchants?: QuickEntryMerchant[] },
): QuickEntryResult {
  const result: QuickEntryResult = {};
  let text = input.trim();
  if (text.startsWith("+")) {
    result.kind = "INCOME";
    text = text.slice(1).trim();
  }
  const tokens = text.split(/\s+/).filter(Boolean);
  const rest: string[] = [];
  let currency: "USD" | "UZS" | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const lower = token.toLowerCase();
    if (USD_WORDS.has(lower)) {
      currency = "USD";
      continue;
    }
    if (UZS_WORDS.has(lower)) {
      currency = "UZS";
      continue;
    }
    if (result.amount === undefined) {
      // «40 500» typed with a space: glue following 3-digit groups.
      let joined = token;
      if (/^\d{1,3}$/.test(token)) {
        while (/^\d{3}([.,]\d{1,2})?(к|k)?$/i.test(tokens[i + 1] ?? "")) {
          joined += tokens[++i];
          if (!/^\d+$/.test(joined)) break;
        }
      }
      // «3 млн» — multiplier as its own word.
      const next = tokens[i + 1]?.toLowerCase();
      if (next && MULTIPLIERS[next.replace(/\.$/, "")] && /^\d/.test(joined)) {
        joined += next.replace(/\.$/, "");
        i++;
      }
      const amount = amountToken(joined);
      if (amount && amount.value.gt(0)) {
        result.amount = toMoneyString(amount.value);
        currency = amount.currency ?? currency;
        continue;
      }
    }
    rest.push(token);
  }

  const words = [...rest];
  const take = (index: number) => words.splice(index, 1);

  const allowed = options.categories.filter((c) => !result.kind || c.type === result.kind);
  const pickCategory = (category: QuickEntryCategory) => {
    result.categoryId = category.id;
    result.kind ??= category.type;
  };

  // A known place wins: it also brings its category.
  const phrase = words.join(" ").toLowerCase();
  const known = phrase
    ? (options.merchants ?? []).find((m) => m.merchant.length >= 3 && (!result.kind || m.type === result.kind) && (phrase.includes(m.merchant.toLowerCase()) || m.merchant.toLowerCase().startsWith(phrase)))
    : undefined;

  // Category: exact name word, then synonyms, then icon hints (user categories like «Парковка»).
  for (let i = 0; i < words.length && !result.categoryId; i++) {
    const word = words[i]!.toLowerCase().replace(/ё/g, "е");
    const s = stem(word);
    const byName = allowed.find((c) =>
      c.name
        .toLowerCase()
        .replace(/ё/g, "е")
        .split(/[\s,]+/)
        .some((part) => part.length >= 3 && stem(part) === s),
    );
    const synonym = SYNONYMS.find(([re]) => re.test(word))?.[1];
    const bySynonym = synonym ? allowed.find((c) => c.name === synonym) : undefined;
    const hintedIcon = suggestCategoryIcon(word);
    const byIcon = hintedIcon ? allowed.find((c) => c.icon === hintedIcon) : undefined;
    const category = byName ?? bySynonym ?? byIcon;
    if (category) {
      pickCategory(category);
      take(i);
    }
  }

  // Account by name, among the words left after the category: «visa», «uzcard», «наличные».
  for (let i = 0; i < words.length && !result.accountId; i++) {
    const s = stem(words[i]!);
    const account = options.accounts.find((a) => a.name.toLowerCase().split(/[\s·\-–—]+/).some((part) => part.length >= 3 && stem(part) === s));
    if (account) {
      result.accountId = account.id;
      take(i);
    }
  }
  if (!result.accountId && currency) {
    result.accountId = options.accounts.find((a) => a.currency === currency)?.id;
  }

  if (known) {
    result.merchant = known.merchant;
    if (!result.categoryId) {
      const category = allowed.find((c) => c.id === known.categoryId);
      if (category) pickCategory(category);
    }
  } else if (words.length > 0) {
    result.merchant = words.join(" ");
  }
  return result;
}
