import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createTestAccount, createUser, resetDatabase } from "../support/factories";

process.env.ADMIN_EMAILS = " Admin@Fyndue.test , other@fyndue.test";

let admin: typeof import("@/lib/services/admin");
beforeAll(async () => {
  admin = await import("@/lib/services/admin");
});

describe("admin overview", () => {
  beforeEach(resetDatabase);

  it("only ADMIN_EMAILS can read it", async () => {
    const someone = await createUser("Someone");
    await expect(admin.getAdminOverview(someone.id)).rejects.toBeInstanceOf(admin.NotAdminError);
    await expect(admin.getAdminOverview("missing")).rejects.toBeInstanceOf(admin.NotAdminError);
  });

  it("lists every user with counts, method and activity, newest first", async () => {
    const owner = await createUser("Owner");
    await prisma.user.update({ where: { id: owner.id }, data: { email: "admin@fyndue.test", createdAt: new Date("2026-09-01T10:00:00Z") } });
    const phoneUser = await createUser("Азиз");
    await prisma.user.update({ where: { id: phoneUser.id }, data: { email: "998901234567@phone.fyndue.uz", phoneNumber: "+998901234567" } });
    await createTestAccount(phoneUser.id);
    await prisma.telegramConnection.create({ data: { userId: phoneUser.id, telegramChatId: "1", status: "CONNECTED" } });
    await prisma.session.create({ data: { id: "s1", userId: phoneUser.id, token: "t1", expiresAt: new Date("2026-12-01") } });

    const { users, totals } = await admin.getAdminOverview(owner.id, new Date("2026-10-05T12:00:00Z"));
    expect(users.map((u) => u.name)).toEqual(["Азиз", "Owner"]);
    expect(users[0]).toMatchObject({ contact: "+998 90 123 45 67", method: "phone", telegram: true, accounts: 1, debts: 0 });
    expect(users[0]!.lastActiveAt).not.toBeNull();
    expect(users[1]).toMatchObject({ contact: "admin@fyndue.test", method: "email", telegram: false, lastActiveAt: null });
    expect(totals).toMatchObject({ users: 2, newLast7Days: 1, phone: 1, telegram: 1 });
  });
});
