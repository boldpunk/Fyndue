"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createTemplate, deleteTemplate } from "@/lib/services/templates";
import { runAction } from "@/lib/utils/action";
import { idSchema } from "@/lib/validations/common";
import { templateCreateSchema } from "@/lib/validations/templates";

const refresh = () => revalidatePath("/", "layout");

export async function createTemplateAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await createTemplate(user.id, templateCreateSchema.parse(input));
    refresh();
    return result;
  });
}

export async function deleteTemplateAction(id: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await deleteTemplate(user.id, idSchema.parse(id));
    refresh();
    return null;
  });
}
