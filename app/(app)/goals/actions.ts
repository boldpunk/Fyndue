"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { contributeToGoal, createGoal, setGoalArchived, updateGoal } from "@/lib/services/goals";
import { runAction } from "@/lib/utils/action";
import { archiveSchema } from "@/lib/validations/accounts";
import { goalContributionSchema, goalCreateSchema, goalUpdateSchema } from "@/lib/validations/goals";

const refresh = () => revalidatePath("/goals");

export async function createGoalAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await createGoal(user.id, goalCreateSchema.parse(input));
    refresh();
    return result;
  });
}

export async function updateGoalAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateGoal(user.id, goalUpdateSchema.parse(input));
    refresh();
    return null;
  });
}

export async function contributeToGoalAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await contributeToGoal(user.id, goalContributionSchema.parse(input));
    refresh();
    return null;
  });
}

export async function archiveGoalAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const { id, archived } = archiveSchema.parse(input);
    await setGoalArchived(user.id, id, archived);
    refresh();
    return null;
  });
}
