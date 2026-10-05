import { Crown, Mail, Phone, Send } from "lucide-react";
import type { Metadata } from "next";
import { ProRequestButtons, ProUserMenu } from "@/components/billing/admin-pro-controls";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { APP_LOCALE } from "@/lib/constants/locale";
import { getAdminOverview, type SignUpMethod } from "@/lib/services/admin";
import { listPendingProRequests } from "@/lib/services/billing";

export const metadata: Metadata = { title: "Админ" };

const METHOD: Record<SignUpMethod, { label: string; icon: typeof Mail }> = {
  phone: { label: "Телефон", icon: Phone },
  email: { label: "Email", icon: Mail },
  google: { label: "Google", icon: Mail },
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [{ users, totals }, requests] = await Promise.all([getAdminOverview(admin.id), listPendingProRequests(admin.id)]);
  const shortDate = new Intl.DateTimeFormat(APP_LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: admin.timezone });
  const dateTime = new Intl.DateTimeFormat(APP_LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: admin.timezone });
  const when = (d: Date | null) => (d ? dateTime.format(d).replace(" г.", "") : "—");

  const stats = [
    { label: "Всего пользователей", value: totals.users },
    { label: "Новых за 7 дней", value: totals.newLast7Days },
    { label: "Заходили за 7 дней", value: totals.activeLast7Days },
    { label: "С ботом в Telegram", value: totals.telegram },
    { label: "Платный Pro", value: totals.paid },
    { label: "Пробный Pro", value: totals.trial },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Админ" description="Кто зарегистрировался в Fyndue. Суммы и названия счетов пользователей здесь не показываются." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="grid gap-1 p-4">
            <span className="tabular text-2xl font-semibold">{s.value}</span>
            <span className="text-sm text-muted-foreground">{s.label}</span>
          </Card>
        ))}
      </div>

      {requests.length > 0 ? (
        <Card className="grid gap-3 border-primary/40 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Crown className="size-4 text-primary" aria-hidden /> Заявки на Pro ({requests.length})
          </h2>
          <p className="text-[13px] text-muted-foreground">Проверьте поступление на карте (в комментарии — код из последних 6 символов id пользователя) и подтвердите.</p>
          <ul className="divide-y rounded-lg border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {r.user.name} · <Money amount={r.amount ?? "0"} currency="UZS" /> за {r.period === "YEAR" ? "год" : "месяц"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {r.user.contact} · код <b>{r.user.id.slice(-6).toUpperCase()}</b> · {when(new Date(r.createdAt))}
                  </span>
                </span>
                <ProRequestButtons id={r.id} name={r.user.name} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Пользователь</th>
                <th className="px-4 py-3 font-medium">Вход</th>
                <th className="px-4 py-3 font-medium">Тариф</th>
                <th className="px-4 py-3 font-medium">Регистрация</th>
                <th className="px-4 py-3 font-medium">Последний вход</th>
                <th className="px-4 py-3 text-right font-medium">Счета</th>
                <th className="px-4 py-3 text-right font-medium">Долги</th>
                <th className="px-4 py-3 text-right font-medium">Операции</th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => {
                const { label, icon: Icon } = METHOD[u.method];
                return (
                  <tr key={u.id} className={u.id === admin.id ? "bg-primary-subtle/40" : undefined}>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {u.name}
                        {u.id === admin.id ? <span className="ml-1.5 text-xs text-muted-foreground">(вы)</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.contact}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge>
                          <Icon aria-hidden /> {label}
                        </Badge>
                        {u.telegram ? (
                          <Badge tone="info">
                            <Send aria-hidden /> Бот
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {u.plan.reason === "admin" ? (
                        <Badge tone="primary">Админ</Badge>
                      ) : u.plan.reason === "paid" ? (
                        <Badge tone="success">
                          <Crown aria-hidden /> до {shortDate.format(u.plan.until!).replace(" г.", "")}
                        </Badge>
                      ) : u.plan.reason === "trial" ? (
                        <Badge tone="info">Пробный · {u.plan.daysLeft} дн.</Badge>
                      ) : (
                        <Badge>Бесплатный</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{when(u.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{when(u.lastActiveAt)}</td>
                    <td className="tabular px-4 py-3 text-right">{u.accounts}</td>
                    <td className="tabular px-4 py-3 text-right">{u.debts}</td>
                    <td className="tabular px-4 py-3 text-right">{u.transactions}</td>
                    <td className="px-2 py-3">{u.plan.reason !== "admin" ? <ProUserMenu userId={u.id} name={u.name} paid={u.plan.reason === "paid"} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
