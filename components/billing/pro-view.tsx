"use client";
import { Check, Copy, Crown, ExternalLink, Hourglass, Minus, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelProRequestAction, requestProAction } from "@/app/(app)/pro/actions";
import { Money } from "@/components/finance/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { FREE_LIMITS, PRO_PRICES, upToText, type LimitedResource, type ProPeriod } from "@/lib/billing/plans";
import { money, toMoneyString } from "@/lib/finance/money";
import { pluralRu } from "@/lib/finance/recurrence";
import type { ProPaymentDTO, UsageDTO } from "@/lib/services/billing";
import { toastActionError } from "@/lib/utils/action-toast";
import { cn } from "@/lib/utils/cn";

type PlanView = { tier: "pro" | "free"; reason: "paid" | "trial" | "admin" | null; until: string | null; daysLeft: number | null };

const ROWS: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: "Операции, категории, бюджеты, календарь, аналитика", free: true, pro: true },
  { label: "Быстрый ввод одной строкой, Telegram-бот, курс ЦБ", free: true, pro: true },
  { label: "Счета", free: upToText("accounts"), pro: "без ограничений" },
  { label: "Кредиты и рассрочки", free: upToText("debts"), pro: "без ограничений" },
  { label: "Подписки", free: upToText("subscriptions"), pro: "без ограничений" },
  { label: "Цели накоплений", free: upToText("goals"), pro: "без ограничений" },
  { label: "Общий счёт с семьёй", free: false, pro: true },
  { label: "Фото чеков к операциям", free: false, pro: true },
  { label: "Экспорт в Excel", free: false, pro: true },
  { label: "Шаблоны операций", free: false, pro: true },
];

const USAGE_LABELS: Record<LimitedResource, string> = { accounts: "Счета", debts: "Долги", subscriptions: "Подписки", goals: "Цели" };
const until = (iso: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)).replace(" г.", "");

/** t.me link with the first message filled in (Telegram opens the chat with it typed). */
function telegramLink(url: string, text: string) {
  return url.startsWith("https://t.me/") ? `${url}?text=${encodeURIComponent(text)}` : url;
}
const contactLabel = (url: string) => (url.startsWith("https://t.me/") ? `@${url.slice("https://t.me/".length).replace(/\/.*/, "")}` : "нам");

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-4 text-success" aria-label="Есть" />;
  if (value === false) return <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Нет" />;
  return <span className="text-[13px]">{value}</span>;
}

export function ProView({
  plan,
  usage,
  pending,
  paymentDetails,
  contactUrl,
  reference,
  highlight,
}: {
  plan: PlanView;
  usage: UsageDTO;
  pending: ProPaymentDTO | null;
  paymentDetails: string[];
  contactUrl: string | null;
  reference: string;
  highlight: "export" | null;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<ProPeriod>("YEAR");
  const [busy, startTransition] = useTransition();
  const price = PRO_PRICES[period];
  // Year price per month, to the nearest thousand: 249 000 / 12 ≈ 21 000.
  const perMonthOfYear = toMoneyString(money(PRO_PRICES.YEAR.amount).div(12_000).toDecimalPlaces(0).times(1000));

  const request = () =>
    startTransition(async () => {
      const result = await requestProAction(period);
      if (!result.ok) return void toastActionError(result);
      toast.success("Заявка отправлена — включим Pro, как только увидим оплату");
      router.refresh();
    });
  const cancel = () =>
    startTransition(async () => {
      if (!pending) return;
      const result = await cancelProRequestAction(pending.id);
      if (!result.ok) return void toastActionError(result);
      router.refresh();
    });

  return (
    <>
      <section className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_12%_8%,#6B5BFF_0,#4F39F6_45%,#2A16B8_100%)] px-6 py-8 text-white sm:px-10">
        <div className="relative grid gap-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold tracking-[.16em] text-[#3DDCAB] uppercase">
            <Crown className="size-4" aria-hidden /> Fyndue Pro
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {plan.tier === "pro"
              ? plan.reason === "admin"
                ? "У вас Pro навсегда"
                : plan.reason === "trial"
                  ? `Пробный Pro: ещё ${plan.daysLeft} ${pluralRu(plan.daysLeft ?? 0, ["день", "дня", "дней"])}`
                  : `Pro до ${until(plan.until!)}`
              : "Всё без ограничений — для себя и семьи"}
          </h1>
          <p className="max-w-xl text-[#dcd8ff]">
            Безлимитные счета, долги, подписки и цели, общий счёт с близкими, чеки и экспорт в Excel. Деньги идут на развитие Fyndue — без рекламы и продажи данных.
          </p>
        </div>
      </section>

      {highlight === "export" ? (
        <p className="rounded-lg border border-primary/30 bg-primary-subtle px-4 py-3 text-sm">Экспорт в Excel — в Fyndue Pro.</p>
      ) : null}

      {plan.reason !== "admin" ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card className="grid content-start gap-5 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{plan.tier === "pro" && plan.reason === "paid" ? "Продлить Pro" : "Подключить Pro"}</h2>
              <Segmented
                label="Период"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "MONTH", label: "Месяц" },
                  { value: "YEAR", label: "Год" },
                ]}
                className="w-44"
              />
            </div>
            <div className="grid gap-1">
              <Money amount={price.amount} currency="UZS" className="text-3xl font-semibold tracking-tight" />
              <p className="text-sm text-muted-foreground">
                {period === "YEAR" ? (
                  <>
                    ≈ <Money amount={perMonthOfYear} currency="UZS" /> в месяц · два месяца в подарок
                  </>
                ) : (
                  "в месяц"
                )}
              </p>
            </div>

            {pending ? (
              <div className="grid gap-3 rounded-xl border bg-muted/40 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Hourglass className="size-4 text-primary" aria-hidden /> Заявка на {pending.period === "YEAR" ? "год" : "месяц"} ждёт проверки
                </p>
                <p className="text-[13px] text-muted-foreground">Как только увидим оплату, включим Pro и пришлём сообщение в Telegram. Обычно в течение дня.</p>
                <Button variant="outline" size="sm" className="w-fit" disabled={busy} onClick={cancel}>
                  Отменить заявку
                </Button>
              </div>
            ) : (
              <>
                {paymentDetails.length > 0 ? (
                  <ol className="grid gap-3 text-sm">
                    <li className="grid gap-2">
                      <span>
                        <b>1.</b> Переведите <Money amount={price.amount} currency="UZS" className="font-semibold" /> по реквизитам:
                      </span>
                      <div className="grid gap-1 rounded-lg border bg-card p-3 font-mono text-[13px]">
                        {paymentDetails.map((line) => (
                          <button
                            key={line}
                            type="button"
                            className="flex items-center justify-between gap-2 text-left hover:text-primary"
                            onClick={() => navigator.clipboard?.writeText(line.replace(/^[^:]*:\s*/, "")).then(() => toast.success("Скопировано"))}
                          >
                            <span>{line}</span>
                            <Copy className="size-3.5 shrink-0 opacity-60" aria-hidden />
                          </button>
                        ))}
                      </div>
                    </li>
                    <li>
                      <b>2.</b> В комментарии к переводу укажите код <code className="rounded bg-muted px-1.5 py-0.5 font-semibold">{reference}</code> — так мы найдём ваш платёж.
                    </li>
                    <li>
                      <b>3.</b> Нажмите кнопку ниже — Pro включится после проверки.
                    </li>
                  </ol>
                ) : (
                  <ol className="grid gap-3 text-sm">
                    <li className="grid gap-2">
                      <span>
                        <b>1.</b> Напишите нам в Telegram — пришлём, как оплатить <Money amount={price.amount} currency="UZS" className="font-semibold" />. Ваш код:{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-semibold">{reference}</code>
                      </span>
                      {contactUrl ? (
                        <Button asChild variant="outline" className="w-fit">
                          <a href={telegramLink(contactUrl, `Здравствуйте! Хочу Fyndue Pro на ${period === "YEAR" ? "год" : "месяц"}. Мой код: ${reference}`)} target="_blank" rel="noopener">
                            <Send /> Написать {contactLabel(contactUrl)} <ExternalLink className="opacity-60" />
                          </a>
                        </Button>
                      ) : null}
                    </li>
                    <li>
                      <b>2.</b> Оплатите, как договоримся.
                    </li>
                    <li>
                      <b>3.</b> Нажмите кнопку ниже — Pro включится после проверки.
                    </li>
                  </ol>
                )}
                <Button size="lg" disabled={busy} onClick={request}>
                  <Sparkles /> Я оплатил {period === "YEAR" ? "год" : "месяц"}
                </Button>
                {contactUrl && paymentDetails.length > 0 ? (
                  <a href={contactUrl} target="_blank" rel="noopener" className="text-center text-[13px] text-muted-foreground hover:text-foreground">
                    Вопросы по оплате — напишите нам
                  </a>
                ) : null}
              </>
            )}
          </Card>

          <Card className="grid content-start gap-3 p-6">
            <h2 className="font-semibold">Сейчас у вас</h2>
            {(Object.keys(FREE_LIMITS) as LimitedResource[]).map((r) => {
              const u = usage[r];
              const full = plan.tier === "free" && u.used >= u.limit;
              return (
                <div key={r} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{USAGE_LABELS[r]}</span>
                    <span className={cn("tabular", full && "font-medium text-warning")}>
                      {u.used}
                      {plan.tier === "free" ? ` из ${u.limit}` : ""}
                    </span>
                  </div>
                  {plan.tier === "free" ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", full ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, (u.used / u.limit) * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            <p className="text-[13px] text-muted-foreground">
              {plan.tier === "pro" ? "В Pro ограничений нет." : "Всё, что уже создано, остаётся доступным — ограничения только на новые."}
            </p>
          </Card>
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Что входит</th>
              <th className="w-28 px-2 py-3 font-medium">Бесплатно</th>
              <th className="w-32 px-2 py-3 font-medium text-primary">
                <Badge tone="primary">
                  <Crown /> Pro
                </Badge>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-2 py-2.5 text-center text-muted-foreground">
                  <Cell value={row.free} />
                </td>
                <td className="px-2 py-2.5 text-center font-medium">
                  <Cell value={row.pro} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
