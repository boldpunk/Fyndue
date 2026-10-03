import { ESIM_CATEGORY_NAME } from "./categories";

/**
 * Quick-start templates for the Subscriptions page. They fill the name,
 * billing period and the page where the subscription is managed; the price
 * is always typed by the user (it depends on the plan, country and card).
 */
export type SubscriptionPreset = {
  key: string;
  name: string;
  frequency: "MONTHLY" | "YEARLY";
  url?: string;
  /** Avatar background; the initials are drawn in white. */
  color: string;
  /** Lower-case fragments that identify the service in a typed name. */
  match: string[];
  /** Usually billed in dollars: the form suggests a foreign-currency card first. */
  foreign: boolean;
  /** Category to preselect instead of «Подписки». */
  category?: string;
};

export const SUBSCRIPTION_PRESETS: SubscriptionPreset[] = [
  { key: "chatgpt", name: "ChatGPT Plus", frequency: "MONTHLY", url: "https://chatgpt.com", color: "#10a37f", match: ["chatgpt", "openai"], foreign: true },
  { key: "claude", name: "Claude Pro", frequency: "MONTHLY", url: "https://claude.ai/settings/billing", color: "#d97757", match: ["claude", "anthropic"], foreign: true },
  { key: "spotify", name: "Spotify Premium", frequency: "MONTHLY", url: "https://www.spotify.com/account/", color: "#1db954", match: ["spotify"], foreign: true },
  { key: "icloud", name: "iCloud+", frequency: "MONTHLY", url: "https://www.icloud.com", color: "#3693f3", match: ["icloud", "apple"], foreign: true },
  { key: "instagram", name: "Instagram Plus", frequency: "MONTHLY", url: "https://www.instagram.com/accounts/", color: "#e1306c", match: ["instagram", "meta verified"], foreign: true },
  { key: "youtube", name: "YouTube Premium", frequency: "MONTHLY", url: "https://www.youtube.com/paid_memberships", color: "#ff0033", match: ["youtube"], foreign: true },
  { key: "telegram", name: "Telegram Premium", frequency: "MONTHLY", url: "https://t.me/PremiumBot", color: "#229ed9", match: ["telegram"], foreign: true },
  { key: "netflix", name: "Netflix", frequency: "MONTHLY", url: "https://www.netflix.com/account", color: "#e50914", match: ["netflix"], foreign: true },
  { key: "google-one", name: "Google One", frequency: "MONTHLY", url: "https://one.google.com/storage", color: "#4285f4", match: ["google one", "google"], foreign: true },
  { key: "github", name: "GitHub", frequency: "MONTHLY", url: "https://github.com/settings/billing", color: "#24292f", match: ["github", "copilot"], foreign: true },
  { key: "esim", name: "eSIM", frequency: "MONTHLY", color: "#0ea5e9", match: ["esim", "airalo", "holafly", "nomad", "roaming", "роуминг"], foreign: true, category: ESIM_CATEGORY_NAME },
  { key: "server", name: "Сервер", frequency: "MONTHLY", color: "#475569", match: ["сервер", "server", "vps", "hetzner", "oracle", "digitalocean"], foreign: true },
  { key: "domain", name: "Домен", frequency: "YEARLY", color: "#6366f1", match: ["домен", "domain", ".uz", ".com"], foreign: false },
];

const FALLBACK_COLORS = ["#7c3aed", "#0891b2", "#db2777", "#ea580c", "#16a34a", "#2563eb", "#9333ea", "#0d9488"];

/** Avatar colour and initials for a subscription name: the matching preset's colour, else a stable colour from the name. */
export function subscriptionAvatar(name: string): { color: string; initials: string } {
  const lower = name.toLowerCase();
  const preset = SUBSCRIPTION_PRESETS.find((p) => p.match.some((m) => lower.includes(m)));
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
  if (preset) return { color: preset.color, initials };
  let hash = 0;
  for (const ch of lower) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return { color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length]!, initials };
}
