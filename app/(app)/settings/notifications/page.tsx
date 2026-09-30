import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationLog } from "@/components/notifications/notification-log";
import { NotificationPreferencesForm } from "@/components/notifications/preferences-form";
import { TelegramConnect } from "@/components/notifications/telegram-connect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getNotificationPreferences, listNotificationLog } from "@/lib/services/notifications";
import { getTelegramConnection } from "@/lib/services/telegram-connection";
import { botUsername } from "@/lib/telegram/server";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const [connection, prefs, log] = await Promise.all([
    getTelegramConnection(user.id),
    getNotificationPreferences(user.id),
    listNotificationLog(user.id, 20),
  ]);
  const bot = botUsername();

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <PageHeader title="Notifications" description="Payment reminders in Telegram: before a due date, on the day, and while a payment is overdue." />

      <Card>
        <CardHeader className="grid gap-1">
          <CardTitle>Telegram</CardTitle>
          <p className="text-[13px] text-muted-foreground">Reminders contain debt names and amounts, never account numbers or links.</p>
        </CardHeader>
        <CardContent>
          <TelegramConnect connection={connection} bot={bot} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="grid gap-1">
          <CardTitle>Reminders</CardTitle>
          <p className="text-[13px] text-muted-foreground">Times are in your time zone ({user.timezone}).</p>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm defaults={prefs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent reminders</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationLog entries={log} timeZone={user.timezone} />
        </CardContent>
      </Card>
    </div>
  );
}
