import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  g.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** Yagona sinf (9-B). Bootstrap yaratgan birinchi sinfni qaytaradi. */
let classCache: { id: string; name: string } | null = null;
export async function getClass() {
  if (classCache) return classCache;
  const c = await prisma.class.findFirst({ orderBy: { createdAt: "asc" } });
  if (!c) throw new Error("Sinf topilmadi. `npm run db:bootstrap` ni ishga tushiring.");
  classCache = { id: c.id, name: c.name };
  return classCache;
}

export async function getSystemSettings() {
  return prisma.systemSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
