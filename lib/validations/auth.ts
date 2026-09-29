import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});
