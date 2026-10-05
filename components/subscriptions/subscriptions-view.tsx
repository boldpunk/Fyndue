"use client";
import { CalendarClock, CardSim, CircleAlert, ExternalLink, MoreHorizontal, Pause, Pencil, Play, Plus, Receipt, Repeat, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteRecurringAction, setRecurringActiveAction } from "@/app/(app)/planning-actions";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { useQuickAdd } from "@/components/layout/quick-add";
import { RecordOccurrenceDialog, type OccurrenceTarget } from "@/components/planning/record-occurrence-dialog";
import type { AccountOption, CategoryOption } from "@/components/transactions/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { SubscriptionPreset } from "@/lib/constants/subscriptions";
import { daysBetween, formatLocalDate } from "@/lib/finance/dates";
import { toMoneyString } from "@/lib/finance/money";
import { describeRule, formatDaysFromToday, monthlyEquivalent, pluralRu } from "@/lib/finance/recurrence";
import type { Occurrence } from "@/lib/services/recurring";
import type { SubscriptionDTO, SubscriptionsPage } from "@/lib/services/subscriptions";
import { cn } from "@/lib/utils/cn";
import { SubscriptionAvatar } from "./subscription-avatar";
import { PresetPicker, SubscriptionForm } from "./subscription-form";
import { toastActionError } from "@/lib/utils/action-toast";

type Editing = { mode: "pick" } | { mode: "new"; preset: SubscriptionPreset | null } | { mode: "edit"; item: SubscriptionDTO };

const shortDate = (d: string) => formatLocalDate(d, undefined, { day: "numeric", month: "short" });

export function SubscriptionsView({
  data,
  accounts,
  categories,
  defaultCategoryId,
  fxRates,
}: {
  data: SubscriptionsPage;
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultCategoryId: string;
  fxRates: Record<string, string>;
}) {
  const router = useRouter();
  const { today, baseCurrency, items, pending, summary, esim } = data;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<SubscriptionDTO | null>(null);
  const [recording, setRecording] = useState<OccurrenceTarget | null>(null);
  const [busy, startTransition] = useTransition();
  const active = items.filter((i) => i.isActive);
  const paused = items.filter((i) => !i.isActive);

  const toggle = (item: SubscriptionDTO) =>
    startTransition(async () => {
      const result = await setRecurringActiveAction({ id: item.id, archived: item.isActive });
      if (!result.ok) return void toastActionError(result);
      toast.success(item.isActive ? `«${item.name}» на паузе — больше не учитывается в планах` : `«${item.name}» снова активна`);
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      if (!deleting) return;
      const result = await deleteRecurringAction(deleting.id);
      if (!result.ok) return void toastActionError(result);
      toast.success("Подписка удалена, записанные платежи сохранены");
      setDeleting(null);
      router.refresh();
    });

  const record = (o: { recurringId: string; date: string; name: string; amount: string; currency: string; accountId: string }) =>
    setRecording({ recurringId: o.recurringId, occurrenceDate: o.date, name: o.name, amount: o.amount, currency: o.currency, accountId: o.accountId, direction: "OUT" });

  const formProps = { accounts, categories, defaultCategoryId, fxRates, baseCurrency, today, onDone: () => setEditing(null) };
  const multiCurrency = summary.byCurrency.length > 1;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Подписки"
        description="Все подписки в одном месте: сколько стоят, когда спишутся и где их отменить."
        actions={
          items.length ? (
            <Button onClick={() => setEditing({ mode: "pick" })}>
              <Plus /> Добавить подписку
            </Button>
          ) : null
        }
      />

      {items.length === 0 ? (
        <Card className="grid gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary">
              <Repeat className="size-5" aria-hidden />
            </span>
            <div className="grid gap-1">
              <h2 className="font-semibold">Добавьте первую подписку</h2>
              <p className="text-sm text-muted-foreground">
                Fyndue посчитает, сколько уходит в месяц и в год, покажет ближайшие списания и учтёт их в календаре и прогнозе баланса.
              </p>
            </div>
          </div>
          <PresetPicker onPick={(preset) => setEditing({ mode: "new", preset })} />
        </Card>
      ) : null}

      {summary.activeCount ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="В месяц" icon={Repeat}>
            {multiCurrency && summary.combined ? (
              <>
                <Money amount={summary.combined.monthly} currency={baseCurrency} className="text-2xl font-semibold tracking-tight" />
                <CurrencyLines lines={summary.byCurrency.map((c) => ({ currency: c.currency, amount: c.monthly }))} />
              </>
            ) : (
              <BigByCurrency lines={summary.byCurrency.map((c) => ({ currency: c.currency, amount: c.monthly }))} />
            )}
          </SummaryCard>
          <SummaryCard label="В год" icon={CalendarClock} footer={multiCurrency && summary.combined?.rateDate ? `Примерно, по курсу ЦБ на ${shortDate(summary.combined.rateDate)}` : undefined}>
            {multiCurrency && summary.combined ? (
              <>
                <Money amount={summary.combined.yearly} currency={baseCurrency} className="text-2xl font-semibold tracking-tight" />
                <CurrencyLines lines={summary.byCurrency.map((c) => ({ currency: c.currency, amount: c.yearly }))} />
              </>
            ) : (
              <BigByCurrency lines={summary.byCurrency.map((c) => ({ currency: c.currency, amount: c.yearly }))} />
            )}
          </SummaryCard>
          <SummaryCard label="Ближайшее списание" icon={Receipt}>
            {summary.next ? (
              <>
                <p className="text-2xl font-semibold tracking-tight first-letter:uppercase">{formatDaysFromToday(daysBetween(today, summary.next.date))}</p>
                <p className="text-sm text-muted-foreground">
                  {shortDate(summary.next.date)} ·{" "}
                  {summary.next.items.map((n, i) => (
                    <span key={n.id}>
                      {i > 0 ? ", " : ""}
                      {n.name} <Money amount={n.amount} currency={n.currency} />
                    </span>
                  ))}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Запланированных списаний нет</p>
            )}
          </SummaryCard>
        </div>
      ) : null}

      {pending.length ? <PendingCard pending={pending} today={today} onRecord={record} /> : null}

      {active.length ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Активные · {active.length}</h2>
          <Card className="divide-y">
            {active.map((item) => (
              <SubscriptionRow key={item.id} item={item} today={today} baseCurrency={baseCurrency} busy={busy} onEdit={() => setEditing({ mode: "edit", item })} onToggle={() => toggle(item)} onDelete={() => setDeleting(item)} onRecord={record} />
            ))}
          </Card>
        </section>
      ) : null}

      {paused.length ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">На паузе · {paused.length}</h2>
          <Card className="divide-y">
            {paused.map((item) => (
              <SubscriptionRow key={item.id} item={item} today={today} baseCurrency={baseCurrency} busy={busy} onEdit={() => setEditing({ mode: "edit", item })} onToggle={() => toggle(item)} onDelete={() => setDeleting(item)} onRecord={record} />
            ))}
          </Card>
        </section>
      ) : null}

      {esim ? <EsimCard esim={esim} today={today} baseCurrency={baseCurrency} fallbackAccountId={accounts.find((a) => a.currency !== baseCurrency)?.id} /> : null}

      <ResponsiveDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.mode === "edit" ? `Изменить «${editing.item.name}»` : editing?.mode === "new" && editing.preset ? editing.preset.name : "Новая подписка"}
      >
        {editing?.mode === "pick" ? <PresetPicker onPick={(preset) => setEditing({ mode: "new", preset })} /> : null}
        {editing?.mode === "new" ? <SubscriptionForm key={editing.preset?.key ?? "blank"} preset={editing.preset} {...formProps} /> : null}
        {editing?.mode === "edit" ? <SubscriptionForm key={editing.item.id} item={editing.item} {...formProps} /> : null}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить «${deleting?.name ?? ""}»?`}
        description="Подписка исчезнет из списка, календаря и прогнозов. Уже записанные платежи останутся. Если отказались на время — лучше поставьте на паузу."
      >
        <div className="flex gap-2">
          <Button variant="destructive" onClick={remove} disabled={busy}>
            Удалить
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Отмена
          </Button>
        </div>
      </ResponsiveDialog>

      <RecordOccurrenceDialog target={recording} onClose={() => setRecording(null)} accounts={accounts} today={today} />
    </div>
  );
}

function SummaryCard({ label, icon: Icon, footer, children }: { label: string; icon: typeof Repeat; footer?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="grid min-w-0 gap-1">{children}</div>
      {footer ? <p className="mt-auto text-[13px] text-muted-foreground">{footer}</p> : null}
    </Card>
  );
}

function BigByCurrency({ lines }: { lines: { currency: string; amount: string }[] }) {
  return (
    <>
      {lines.map((l) => (
        <Money key={l.currency} amount={l.amount} currency={l.currency} className="text-2xl font-semibold tracking-tight" />
      ))}
    </>
  );
}

function CurrencyLines({ lines }: { lines: { currency: string; amount: string }[] }) {
  return (
    <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
      {lines.map((l, i) => (
        <span key={l.currency}>
          {i > 0 ? "+ " : ""}
          <Money amount={l.amount} currency={l.currency} />
        </span>
      ))}
    </p>
  );
}

function PendingCard({ pending, today, onRecord }: { pending: Occurrence[]; today: string; onRecord: (o: Occurrence) => void }) {
  return (
    <Card className="grid gap-3 border-warning/40 p-4">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="grid gap-0.5">
          <h2 className="text-sm font-semibold">Пора записать · {pending.length}</h2>
          <p className="text-[13px] text-muted-foreground">Эти списания уже прошли или проходят сегодня. Запишите их, когда деньги спишутся, — тогда баланс карты в Fyndue совпадёт с банком.</p>
        </div>
      </div>
      <ul className="grid gap-1">
        {pending.map((o) => (
          <li key={`${o.recurringId}-${o.date}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
            <SubscriptionAvatar name={o.name} className="size-8 rounded-lg text-xs" />
            <div className="grid min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{o.name}</span>
              <span className="text-[13px] text-muted-foreground">
                {shortDate(o.date)} · {formatDaysFromToday(daysBetween(today, o.date))}
              </span>
            </div>
            <Money amount={o.amount} currency={o.currency} className="text-sm font-medium" />
            <Button size="sm" variant="outline" onClick={() => onRecord(o)}>
              Записать
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SubscriptionRow({
  item,
  today,
  baseCurrency,
  busy,
  onEdit,
  onToggle,
  onDelete,
  onRecord,
}: {
  item: SubscriptionDTO;
  today: string;
  baseCurrency: string;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRecord: (o: { recurringId: string; date: string; name: string; amount: string; currency: string; accountId: string }) => void;
}) {
  const next = item.nextOccurrence;
  const soon = next !== null && daysBetween(today, next) <= 3;
  const perMonth = item.frequency === "MONTHLY" && item.interval === 1 ? null : toMoneyString(monthlyEquivalent(item.amount, item.frequency, item.interval));
  return (
    <div className={cn("flex items-center gap-3 p-3", !item.isActive && "opacity-60")}>
      <SubscriptionAvatar name={item.name} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{item.name}</span>
          {!item.isActive ? <Badge>На паузе</Badge> : null}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {describeRule(item)} · {item.account.name}
        </p>
        {item.isActive ? (
          <p className={cn("text-[13px]", soon ? "font-medium text-warning" : "text-muted-foreground")}>
            {next ? `${shortDate(next)} · ${formatDaysFromToday(daysBetween(today, next))}` : "Завершена"}
          </p>
        ) : null}
      </div>
      <div className="grid shrink-0 justify-items-end gap-0.5 text-right">
        <Money amount={item.amount} currency={item.currency} className="text-sm font-semibold" />
        {item.amountInBase ? (
          <span className="text-[12px] text-muted-foreground">
            ≈ <Money amount={item.amountInBase} currency={baseCurrency} />
          </span>
        ) : null}
        {perMonth ? (
          <span className="text-[12px] text-muted-foreground">
            <Money amount={perMonth} currency={item.currency} /> в мес.
          </span>
        ) : null}
      </div>
      {item.url ? (
        <Button asChild variant="ghost" size="icon-sm" className="hidden sm:inline-flex">
          <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Открыть сайт: ${item.name}`} title="Где управлять или отменить">
            <ExternalLink />
          </a>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Действия: ${item.name}`} disabled={busy}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item.isActive && next ? (
            <DropdownMenuItem onSelect={() => onRecord({ recurringId: item.id, date: next, name: item.name, amount: item.amount, currency: item.currency, accountId: item.account.id })}>
              <Receipt /> Записать оплату
            </DropdownMenuItem>
          ) : null}
          {item.url ? (
            <DropdownMenuItem asChild>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Управлять / отменить
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Изменить
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggle}>
            {item.isActive ? <Pause /> : <Play />} {item.isActive ? "Поставить на паузу" : "Возобновить"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-danger">
            <Trash2 /> Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}


function EsimCard({
  esim,
  today,
  baseCurrency,
  fallbackAccountId,
}: {
  esim: NonNullable<SubscriptionsPage["esim"]>;
  today: string;
  baseCurrency: string;
  fallbackAccountId?: string;
}) {
  const { open } = useQuickAdd();
  const multi = esim.byCurrency.length > 1;
  return (
    <Card className="grid gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-subtle text-info">
          <CardSim className="size-5" aria-hidden />
        </span>
        <div className="grid gap-0.5">
          <h2 className="text-sm font-semibold">eSIM в поездках</h2>
          <p className="text-[13px] text-muted-foreground">
            Разовые покупки, а не подписка: в план и прогноз не попадают. Здесь видно, сколько уходит на связь за границей.
          </p>
        </div>
      </div>
      {esim.count ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-0.5">
            <p className="text-[13px] text-muted-foreground">
              За 12 месяцев · {esim.count} {pluralRu(esim.count, ["покупка", "покупки", "покупок"])}
            </p>
            {multi && esim.combined ? (
              <>
                <Money amount={esim.combined.total} currency={baseCurrency} className="text-xl font-semibold tracking-tight" />
                <CurrencyLines lines={esim.byCurrency.map((c) => ({ currency: c.currency, amount: c.total }))} />
              </>
            ) : (
              esim.byCurrency.map((c) => <Money key={c.currency} amount={c.total} currency={c.currency} className="text-xl font-semibold tracking-tight" />)
            )}
          </div>
          {esim.last ? (
            <div className="grid gap-0.5">
              <p className="text-[13px] text-muted-foreground">Последняя покупка</p>
              <p className="text-sm font-medium">
                {esim.last.merchant || "eSIM"} · <Money amount={esim.last.amount} currency={esim.last.currency} />
              </p>
              <p className="text-[13px] text-muted-foreground">
                {shortDate(esim.last.date)} · {formatDaysFromToday(daysBetween(today, esim.last.date))}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Пока ни одной покупки. Купили eSIM — запишите её, а в поле «Где / у кого» укажите сервис или страну (Airalo, Holafly, Турция…).</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => open("EXPENSE", { categoryId: esim.categoryId, accountId: esim.usualAccountId ?? fallbackAccountId })}>
          <Plus /> Записать покупку eSIM
        </Button>
        {esim.count ? (
          <Button asChild variant="ghost">
            <Link href={`/transactions?category=${esim.categoryId}`}>Все покупки</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
