import { z } from "zod";
import "./zod-ru";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Формат ЧЧ:ММ");

export const notificationPreferencesSchema = z
  .object({
    telegramEnabled: z.boolean(),
    notifyDaysBefore: z
      .array(z.coerce.number().int().min(1, "От 1 до 30 дней").max(30, "От 1 до 30 дней"))
      .max(6, "Не больше 6 напоминаний")
      .transform((days) => [...new Set(days)].sort((a, b) => b - a)),
    notifyOnDueDate: z.boolean(),
    notifyWhenOverdue: z.boolean(),
    overdueRepeatDays: z.coerce.number().int().min(1, "От 1 до 30 дней").max(30, "От 1 до 30 дней"),
    quietHoursEnabled: z.boolean(),
    quietHoursStart: time,
    quietHoursEnd: time,
  })
  .refine((v) => !v.quietHoursEnabled || v.quietHoursStart !== v.quietHoursEnd, {
    message: "Начало и конец должны отличаться",
    path: ["quietHoursEnd"],
  });
export type NotificationPreferencesInput = z.output<typeof notificationPreferencesSchema>;
