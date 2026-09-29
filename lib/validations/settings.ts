import { z } from "zod";
import { TIMEZONES } from "@/lib/constants/finance";
import { currencySchema } from "./common";

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  baseCurrency: currencySchema,
  timezone: z.enum(TIMEZONES),
});
export type ProfileInput = z.output<typeof profileSchema>;

export const themeSchema = z.enum(["LIGHT", "DARK", "SYSTEM"]);
