import "server-only";
import { prisma } from "@/lib/db";
import type { Theme } from "@/lib/generated/prisma/client";
import type { ProfileInput } from "@/lib/validations/settings";
import { writeAudit } from "./audit";

export async function getSettings(userId: string) {
  return prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { name: input.name, baseCurrency: input.baseCurrency, timezone: input.timezone },
    });
    await writeAudit(tx, {
      userId,
      action: "PROFILE_UPDATED",
      entityType: "User",
      entityId: userId,
      metadata: { baseCurrency: input.baseCurrency, timezone: input.timezone },
    });
  });
}

export async function updateTheme(userId: string, theme: Theme): Promise<void> {
  await prisma.userSettings.upsert({ where: { userId }, create: { userId, theme }, update: { theme } });
}
