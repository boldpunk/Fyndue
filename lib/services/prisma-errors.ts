import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!field) return true;
  return JSON.stringify(error.meta ?? {}).includes(field);
}
