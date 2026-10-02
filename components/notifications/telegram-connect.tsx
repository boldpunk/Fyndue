"use client";
import { Check, Copy, ExternalLink, Send, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createTelegramCodeAction, disconnectTelegramAction, sendTestNotificationAction } from "@/app/(app)/settings/notifications/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { TelegramConnectionDTO } from "@/lib/services/telegram-connection";

type Issued = { code: string; expiresAt: string; deepLink: string; bot: string };

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` };
}

export function TelegramConnect({ connection, bot }: { connection: TelegramConnectionDTO; bot: string | null }) {
  const router = useRouter();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const connected = connection.status === "CONNECTED";
  const countdown = useCountdown(issued && !connected ? issued.expiresAt : null);
  const expired = countdown?.left === 0;

  // While a code is waiting, check every few seconds whether the bot received it.
  useEffect(() => {
    if (!issued || connected || expired) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [issued, connected, expired, router]);

  useEffect(() => {
    if (connected && issued) toast.success("Telegram connected");
  }, [connected, issued]);

  const createCode = () =>
    startTransition(async () => {
      const result = await createTelegramCodeAction();
      if (!result.ok) return void toast.error(result.error);
      setIssued(result.data);
      setCopied(false);
    });
  const sendTest = () =>
    startTransition(async () => {
      const result = await sendTestNotificationAction();
      if (!result.ok) return void toast.error(result.error);
      toast.success("Test message sent");
      router.refresh();
    });
  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectTelegramAction();
      if (!result.ok) return void toast.error(result.error);
      setConfirming(false);
      setIssued(null);
      toast.success("Telegram disconnected");
      router.refresh();
    });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the code and copy it manually.");
    }
  };

  if (!bot) {
    return (
      <div className="grid gap-2 text-sm">
        <p>Telegram isn&apos;t set up on this server yet.</p>
        <p className="text-muted-foreground">
          Create a bot with <span className="font-medium text-foreground">@BotFather</span>, put its token and username in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[13px]">TELEGRAM_BOT_TOKEN</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[13px]">TELEGRAM_BOT_USERNAME</code> in <code className="rounded bg-muted px-1 py-0.5 text-[13px]">.env</code>,
          restart the app, and run <code className="rounded bg-muted px-1 py-0.5 text-[13px]">pnpm telegram:dev</code>.
        </p>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="success">
            <Check aria-hidden /> Connected
          </Badge>
          <span className="text-muted-foreground">
            {connection.username ? `@${connection.username}` : "Telegram chat"}
            {connection.connectedAt ? ` · since ${new Date(connection.connectedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={sendTest} disabled={pending}>
            <Send /> Send test message
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirming(true)} disabled={pending}>
            <Unlink /> Disconnect
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          In the chat, try /today, /upcoming, /debts or /month.
        </p>
        <ResponsiveDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Disconnect Telegram?"
          description="Reminders stop right away. You can connect again at any time."
        >
          <div className="flex gap-2">
            <Button variant="destructive" onClick={disconnect} disabled={pending}>
              {pending ? "Disconnecting…" : "Disconnect"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </ResponsiveDialog>
      </div>
    );
  }

  if (issued && !expired) {
    return (
      <div className="grid gap-4">
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          <li>Open @{issued.bot} in Telegram and press Start.</li>
          <li>If Telegram doesn&apos;t send it for you, send the code below.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <code className="tabular rounded-lg border bg-muted px-4 py-2 font-mono text-xl font-semibold tracking-[0.2em]" aria-label={`Code ${issued.code.split("").join(" ")}`}>
            {issued.code}
          </code>
          <Button variant="ghost" size="sm" onClick={() => copy(`/start ${issued.code}`)}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy /start command"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={issued.deepLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open Telegram
            </a>
          </Button>
          <span className="text-[13px] text-muted-foreground" aria-live="polite">
            Waiting for the bot… code expires in {countdown?.label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {connection.status === "DISCONNECTED"
          ? "Telegram is disconnected. Connect again to get reminders."
          : expired
            ? "The code expired. Create a new one."
            : "Get payment reminders from the Fyndue bot. You'll get a one-time code that works for 10 minutes."}
      </p>
      <div>
        <Button onClick={createCode} disabled={pending}>
          <Send /> {pending ? "Creating code…" : "Connect Telegram"}
        </Button>
      </div>
    </div>
  );
}
