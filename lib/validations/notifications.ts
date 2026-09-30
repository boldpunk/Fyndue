import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const notificationPreferencesSchema = z
  .object({
    telegramEnabled: z.boolean(),
    notifyDaysBefore: z
      .array(z.coerce.number().int().min(1, "1–30 days").max(30, "1–30 days"))
      .max(6, "At most 6 reminders")
      .transform((days) => [...new Set(days)].sort((a, b) => b - a)),
    notifyOnDueDate: z.boolean(),
    notifyWhenOverdue: z.boolean(),
    overdueRepeatDays: z.coerce.number().int().min(1, "1–30 days").max(30, "1–30 days"),
    quietHoursEnabled: z.boolean(),
    quietHoursStart: time,
    quietHoursEnd: time,
  })
  .refine((v) => !v.quietHoursEnabled || v.quietHoursStart !== v.quietHoursEnd, {
    message: "Start and end must differ",
    path: ["quietHoursEnd"],
  });
export type NotificationPreferencesInput = z.output<typeof notificationPreferencesSchema>;
