import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { contributeToGoal, createGoal, listGoals, setGoalArchived, updateGoal } from "@/lib/services/goals";
import { createTestAccount, createUser, resetDatabase } from "../support/factories";

const now = new Date("2026-10-05T08:00:00Z");

describe("savings goals", () => {
  beforeEach(resetDatabase);

  it("a goal with its own savings: put aside, take back, never below zero", async () => {
    const user = await createUser();
    const { id } = await createGoal(user.id, { name: "Отпуск", icon: "plane", targetAmount: "10000000.00", currency: "UZS", targetDate: "2027-05-01", savedAmount: "2500000.00" });
    let goal = (await listGoals(user.id, { now })).goals[0]!;
    expect(goal.progress).toMatchObject({ saved: "2500000.00", percent: "25.0", monthsLeft: 7, perMonth: "1071428.58", state: "on-track" });

    await contributeToGoal(user.id, { id, amount: "7500000.00" });
    goal = (await listGoals(user.id, { now })).goals[0]!;
    expect(goal.progress.state).toBe("achieved");

    await contributeToGoal(user.id, { id, amount: "-1000000.00" });
    expect((await listGoals(user.id, { now })).goals[0]!.progress.saved).toBe("9000000.00");
    await expect(contributeToGoal(user.id, { id, amount: "-9000000.01" })).rejects.toThrow(DomainError);
  });

  it("a goal on an account follows its balance; currency must match", async () => {
    const user = await createUser();
    const savings = await createTestAccount(user.id, { name: "Копилка", currency: "USD", openingBalance: "300.00" });
    await expect(createGoal(user.id, { name: "Ноутбук", icon: "laptop", targetAmount: "1200.00", currency: "UZS", accountId: savings.id })).rejects.toThrow("USD");
    const { id } = await createGoal(user.id, { name: "Ноутбук", icon: "laptop", targetAmount: "1200.00", currency: "USD", accountId: savings.id });
    const goal = (await listGoals(user.id, { now })).goals[0]!;
    expect(goal).toMatchObject({ account: { id: savings.id, name: "Копилка" }, progress: { saved: "300.00", percent: "25.0", state: "no-date" } });
    await expect(contributeToGoal(user.id, { id, amount: "10.00" })).rejects.toThrow("счёте");
  });

  it("other users can't see or change a goal", async () => {
    const user = await createUser();
    const other = await createUser();
    const otherAccount = await createTestAccount(other.id);
    const { id } = await createGoal(user.id, { name: "Машина", icon: "car", targetAmount: "100.00", currency: "UZS" });
    expect((await listGoals(other.id, { now })).goals).toEqual([]);
    await expect(contributeToGoal(other.id, { id, amount: "1.00" })).rejects.toThrow(DomainError);
    await expect(setGoalArchived(other.id, id, true)).rejects.toThrow(DomainError);
    await expect(updateGoal(other.id, { id, name: "x", icon: "car", targetAmount: "1.00", currency: "UZS" })).rejects.toThrow(DomainError);
    await expect(createGoal(user.id, { name: "x", icon: "car", targetAmount: "1.00", currency: "UZS", accountId: otherAccount.id })).rejects.toThrow(DomainError);
    await setGoalArchived(user.id, id, true);
    expect((await listGoals(user.id, { now })).goals).toEqual([]);
  });
});
