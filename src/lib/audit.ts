import type { Prisma, Role } from "@prisma/client";
import { prisma } from "./db";

export type AuditParams = {
  user?: { id: string; fullName: string; role: Role } | null;
  userName?: string;
  action: string;
  category: string;
  description: string;
  entityType?: string;
  entityId?: string;
  ip?: string | null;
  userAgent?: string | null;
  client?: Prisma.TransactionClient;
};

/**
 * Faqat qo'shiladi (append-only): ilova hech qachon UPDATE/DELETE qilmaydi, bazada esa
 * trigger (scripts/bootstrap.mjs) ularni bloklaydi.
 * `client` (tranzaksiya) berilsa xato tashqariga chiqadi — o'zgarish va jurnal birga bekor bo'ladi.
 */
export async function logActivity(p: AuditParams): Promise<void> {
  const data = {
    userId: p.user?.id ?? null,
    userName: p.user?.fullName ?? p.userName ?? "Tizim",
    role: p.user?.role ?? null,
    action: p.action,
    category: p.category,
    description: p.description.slice(0, 1000),
    entityType: p.entityType ?? null,
    entityId: p.entityId ?? null,
    ip: p.ip ?? null,
    userAgent: p.userAgent ?? null,
  };
  if (p.client) {
    await p.client.activityLog.create({ data });
    return;
  }
  try {
    await prisma.activityLog.create({ data });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "audit-log-failed", err: String(e) }));
  }
}
