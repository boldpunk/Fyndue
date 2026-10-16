import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Personal link for bank notices (iPhone Shortcuts, Android SMS forwarders):
 * POST /api/ingest/<token>. Only the token's SHA-256 is stored; a new link
 * replaces the old one.
 */
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createIngestToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.user.update({ where: { id: userId }, data: { ingestTokenHash: hash(token) } });
  return token;
}

export async function revokeIngestToken(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { ingestTokenHash: null } });
}

export async function hasIngestToken(userId: string): Promise<boolean> {
  return Boolean((await prisma.user.findUnique({ where: { id: userId }, select: { ingestTokenHash: true } }))?.ingestTokenHash);
}

export async function userIdForIngestToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return (await prisma.user.findUnique({ where: { ingestTokenHash: hash(token) }, select: { id: true } }))?.id ?? null;
}
