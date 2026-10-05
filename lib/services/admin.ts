import "server-only";
import { isAdminEmail } from "@/lib/auth/admin";
import { formatPhone, isPhoneAccountEmail } from "@/lib/auth/phone";
import { prisma } from "@/lib/db";

/**
 * The admin tab (docs/security.md §2a): who signed up and whether they use
 * Fyndue. Deliberately the one cross-user read in the app, so it re-checks
 * the caller is an admin and returns counts only — never amounts, account
 * names or debt details.
 */

export class NotAdminError extends Error {
  constructor() {
    super("Not an admin");
  }
}

export type SignUpMethod = "phone" | "email" | "google";

export type AdminUserRow = {
  id: string;
  name: string;
  /** Formatted phone for phone accounts, otherwise the email. */
  contact: string;
  method: SignUpMethod;
  createdAt: Date;
  /** Latest session activity; null when the user never signed in after sign-up. */
  lastActiveAt: Date | null;
  telegram: boolean;
  accounts: number;
  debts: number;
  transactions: number;
};

export type AdminOverview = {
  users: AdminUserRow[];
  totals: { users: number; newLast7Days: number; activeLast7Days: number; phone: number; telegram: number };
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function assertAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user || !isAdminEmail(user.email)) throw new NotAdminError();
}

export async function getAdminOverview(adminUserId: string, now: Date = new Date()): Promise<AdminOverview> {
  await assertAdmin(adminUserId);
  const [rows, lastSessions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        createdAt: true,
        authAccounts: { select: { providerId: true } },
        telegramConnection: { select: { status: true } },
        _count: { select: { accounts: { where: { isArchived: false } }, debts: true, transactions: { where: { voidedAt: null } } } },
      },
    }),
    prisma.session.groupBy({ by: ["userId"], _max: { updatedAt: true } }),
  ]);
  const lastActive = new Map(lastSessions.map((s) => [s.userId, s._max.updatedAt]));

  const users: AdminUserRow[] = rows.map((u) => {
    const phoneAccount = isPhoneAccountEmail(u.email);
    const method: SignUpMethod = phoneAccount ? "phone" : u.authAccounts.some((a) => a.providerId === "google") ? "google" : "email";
    return {
      id: u.id,
      name: u.name,
      contact: phoneAccount && u.phoneNumber ? formatPhone(u.phoneNumber) : u.email,
      method,
      createdAt: u.createdAt,
      lastActiveAt: lastActive.get(u.id) ?? null,
      telegram: u.telegramConnection?.status === "CONNECTED",
      accounts: u._count.accounts,
      debts: u._count.debts,
      transactions: u._count.transactions,
    };
  });

  const weekAgo = now.getTime() - 7 * DAY_MS;
  return {
    users,
    totals: {
      users: users.length,
      newLast7Days: users.filter((u) => u.createdAt.getTime() >= weekAgo).length,
      activeLast7Days: users.filter((u) => u.lastActiveAt && u.lastActiveAt.getTime() >= weekAgo).length,
      phone: users.filter((u) => u.method === "phone").length,
      telegram: users.filter((u) => u.telegram).length,
    },
  };
}
