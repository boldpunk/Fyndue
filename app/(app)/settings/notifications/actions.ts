"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { sendTestNotification, updateNotificationPreferences } from "@/lib/services/notifications";
import { createConnectionCode, disconnectTelegram } from "@/lib/services/telegram-connection";
import { botUsername, getTelegramClient } from "@/lib/telegram/server";
import { runAction } from "@/lib/utils/action";
import { notificationPreferencesSchema } from "@/lib/validations/notifications";

const PATH = "/settings/notifications";

export async function createTelegramCodeAction() {
  return runAction(async () => {
    const user = await requireUser();
    const bot = botUsername();
    if (!bot) throw new DomainError("Telegram на этом сервере не настроен.");
    const { code, expiresAt } = await createConnectionCode(user.id);
    revalidatePath(PATH);
    return { code, expiresAt, deepLink: `https://t.me/${bot}?start=${code}`, bot };
  });
}

export async function disconnectTelegramAction() {
  return runAction(async () => {
    const user = await requireUser();
    await disconnectTelegram(user.id);
    revalidatePath(PATH);
    return null;
  });
}

export async function sendTestNotificationAction() {
  return runAction(async () => {
    const user = await requireUser();
    const client = getTelegramClient();
    if (!client) throw new DomainError("Telegram на этом сервере не настроен.");
    await sendTestNotification(user.id, client);
    revalidatePath(PATH);
    return null;
  });
}

export async function updateNotificationPreferencesAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateNotificationPreferences(user.id, notificationPreferencesSchema.parse(input));
    revalidatePath(PATH);
    return null;
  });
}
