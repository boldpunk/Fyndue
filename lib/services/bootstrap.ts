import "server-only";
import { prisma } from "@/lib/db";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/constants/categories";

/**
 * Creates the per-user rows every account needs: settings and the default
 * category set (SPEC §27). Idempotent — safe to run more than once.
 */
export async function bootstrapUser(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
    await tx.category.createMany({
      data: [
        ...DEFAULT_EXPENSE_CATEGORIES.map((c, index) => ({ ...c, type: "EXPENSE" as const, sortOrder: index })),
        ...DEFAULT_INCOME_CATEGORIES.map((c, index) => ({ ...c, type: "INCOME" as const, sortOrder: index })),
      ].map(({ name, icon, color, type, sortOrder, isSystem }) => ({
        userId,
        name,
        icon,
        color,
        type,
        sortOrder,
        isDefault: true,
        isSystem: isSystem ?? false,
      })),
      skipDuplicates: true,
    });
  });
}
