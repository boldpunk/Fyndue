import { ArrowRightLeft, Bell, ChevronRight, Repeat, Shapes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { AppearancePicker } from "@/components/settings/appearance-picker";
import { ProfileForm } from "@/components/settings/profile-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { TIMEZONES } from "@/lib/constants/finance";
import { getTelegramConnection } from "@/lib/services/telegram-connection";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const connection = await getTelegramConnection(user.id);
  const timezone = (TIMEZONES as readonly string[]).includes(user.timezone) ? (user.timezone as (typeof TIMEZONES)[number]) : "Asia/Tashkent";

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <PageHeader title="Settings" description={user.email} />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm defaults={{ name: user.name, baseCurrency: user.baseCurrency, timezone }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearancePicker />
        </CardContent>
      </Card>

      <Card className="divide-y">
        <Link href="/settings/categories" className="flex items-center gap-3 p-4 hover:bg-muted/60">
          <Shapes className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm font-medium">Categories</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
        <Link href="/settings/exchange-rates" className="flex items-center gap-3 p-4 hover:bg-muted/60">
          <ArrowRightLeft className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm font-medium">Exchange rates</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
        <Link href="/transactions/recurring" className="flex items-center gap-3 p-4 hover:bg-muted/60">
          <Repeat className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm font-medium">Recurring items</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
        <Link href="/settings/notifications" className="flex items-center gap-3 p-4 hover:bg-muted/60">
          <Bell className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm font-medium">Notifications &amp; Telegram</span>
          {connection.status === "CONNECTED" ? <Badge tone="success">Connected</Badge> : null}
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      </Card>

      <div className="lg:hidden">
        <SignOutButton className="justify-center border" />
      </div>
    </div>
  );
}
