import type { Metadata } from "next";
import Link from "next/link";
import { IngestLink } from "@/components/settings/ingest-link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/services/accounts";
import { cardsOf } from "@/lib/services/bank-import";
import { hasIngestToken } from "@/lib/services/ingest-link";
import { botUsername } from "@/lib/telegram/server";

export const metadata: Metadata = { title: "Автоучёт" };

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3 text-sm">
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">{n}</span>
    <span className="pt-0.5">{children}</span>
  </li>
);

export default async function AutoImportPage() {
  const user = await requireUser();
  const [accounts, hasLink] = await Promise.all([listAccounts(user.id), hasIngestToken(user.id)]);
  const bot = botUsername();
  const linked = accounts.filter((a) => cardsOf(a).length > 0);

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <PageHeader title="Автоучёт" description="Расходы и доходы записываются сами — из уведомлений банка о каждой операции." />

      <Card>
        <CardHeader>
          <CardTitle>1. Привяжите карты к счетам</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-muted-foreground">Уведомление называет карту последними 4 цифрами (***2034) — так Fyndue понимает, на какой счёт записать.</p>
          {linked.length > 0 ? (
            <ul className="grid gap-1">
              {linked.map((a) => (
                <li key={a.id}>
                  <b>{a.name}</b> — {cardsOf(a).map((c) => `***${c}`).join(", ")}
                </li>
              ))}
            </ul>
          ) : (
            <p>Пока ни одна карта не привязана.</p>
          )}
          <p className="text-muted-foreground">
            Укажите цифры в настройках счёта (<Link href="/accounts" className="font-medium text-primary hover:underline">Счета</Link> → счёт → Изменить) или отправьте боту{" "}
            <code className="rounded bg-muted px-1">/card 2034 Uzum</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Пересылайте уведомления боту</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3">
            <Step n={1}>Подключите уведомления Uzcard в Telegram-боте @CardXabarBot (если ещё нет).</Step>
            <Step n={2}>
              Выделите одно или несколько уведомлений и перешлите их {bot ? <b>@{bot}</b> : "боту Fyndue"}. Можно и вставить текст SMS.
            </Step>
            <Step n={3}>Бот ответит, что записал: сумма, место, категория и счёт. Ошиблись — /undo отменит последнюю.</Step>
          </ol>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Одно и то же уведомление дважды не запишется. Если вы уже внесли операцию вручную, дубля не будет. Перевод между своими картами станет переводом, а комиссия банка — отдельным расходом.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Совсем автоматически — с телефона</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <p className="text-muted-foreground">Личная ссылка принимает текст уведомления. Телефон может отправлять на неё каждую SMS банка сам.</p>
          <IngestLink hasLink={hasLink} />
          <div className="grid gap-2">
            <p className="font-medium">iPhone — приложение «Команды»</p>
            <ol className="grid gap-2">
              <Step n={1}>Автоматизация → Новая → «Сообщение»: отправитель — ваш банк, «Запускать сразу».</Step>
              <Step n={2}>Действие «Получить содержимое URL»: ваша ссылка, метод POST, тело — «Текст», значение — «Ввод команды».</Step>
            </ol>
          </div>
          <div className="grid gap-2">
            <p className="font-medium">Android</p>
            <p className="text-muted-foreground">Приложение для пересылки SMS (например, MacroDroid или «SMS to URL Forwarder»): на SMS от банка — HTTP POST текста на вашу ссылку.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
