import { z } from "zod";
import "./zod-ru";

export const loginSchema = z.object({
  email: z.email("Введите корректный email").trim().toLowerCase(),
  password: z.string().min(1, "Введите пароль"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Введите имя").max(80),
  email: z.email("Введите корректный email").trim().toLowerCase(),
  password: z.string().min(10, "Не меньше 10 символов").max(128),
});
