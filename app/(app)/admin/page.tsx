import { Mail, Phone, Send } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { APP_LOCALE } from "@/lib/constants/locale";
import { getAdminOverview, type SignUpMethod } from "@/lib/services/admin";

export const metadata: Metadata = { title: "Админ" };

const METHOD: Record<SignUpMethod, { label: string; icon: typeof Mail }> = {
  phone: { label: "Телефон", icon: Phone },
  email: { label: "Email", icon: Mail },
  google: { label: "Google", icon: Mail },
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  const { users, totals } = await getAdminOverview(admin.id);
  const dateTime = new Intl.DateTimeFormat(APP_LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: admin.timezone });
  const when = (d: Date | null) => (d ? dateTime.format(d).replace(" г.", "") : "—");

  const stats = [
    { label: "Всего пользователей", value: totals.users },
    { label: "Новых за 7 дней", value: totals.newLast7Days },
    { label: "Заходили за 7 дней", value: totals.activeLast7Days },
    { label: "С ботом в Telegram", value: totals.telegram },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Админ" description="Кто зарегистрировался в Fyndue. Суммы и названия счетов пользователей здесь не показываются." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="grid gap-1 p-4">
            <span className="tabular text-2xl font-semibold">{s.value}</span>
            <span className="text-sm text-muted-foreground">{s.label}</span>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Пользователь</th>
                <th className="px-4 py-3 font-medium">Вход</th>
                <th className="px-4 py-3 font-medium">Регистрация</th>
                <th className="px-4 py-3 font-medium">Последний вход</th>
                <th className="px-4 py-3 text-right font-medium">Счета</th>
                <th className="px-4 py-3 text-right font-medium">Долги</th>
                <th className="px-4 py-3 text-right font-medium">Операции</th>
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
                    <td className="px-4 py-3 whitespace-nowrap">{when(u.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{when(u.lastActiveAt)}</td>
                    <td className="tabular px-4 py-3 text-right">{u.accounts}</td>
                    <td className="tabular px-4 py-3 text-right">{u.debts}</td>
                    <td className="tabular px-4 py-3 text-right">{u.transactions}</td>
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
