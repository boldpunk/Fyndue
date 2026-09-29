"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { updateProfile, updateTheme } from "@/lib/services/settings";
import { runAction } from "@/lib/utils/action";
import { profileSchema, themeSchema } from "@/lib/validations/settings";

export async function updateProfileAction(input: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateProfile(user.id, profileSchema.parse(input));
    revalidatePath("/", "layout");
    return null;
  });
}

export async function updateThemeAction(theme: unknown) {
  return runAction(async () => {
    const user = await requireUser();
    await updateTheme(user.id, themeSchema.parse(theme));
    return null;
  });
}
