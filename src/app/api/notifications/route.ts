import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, paging } from "@/lib/api";
import { syncReminders } from "@/lib/notify";
import type { NotificationType, Prisma } from "@prisma/client";

const TYPES = ["ATTENDANCE_SAVED", "STUDENT_ABSENT", "HOMEWORK_ASSIGNED", "HOMEWORK_DEADLINE", "NEW_ANNOUNCEMENT", "GRADE_UPDATED", "TIMETABLE_CHANGED", "UPCOMING_EXAM", "MESSAGE", "SYSTEM"];

// Faqat o'z bildirishnomalari ko'rinadi
export const GET = route({}, async ({ session, query }) => {
  await syncReminders(session.id).catch(() => {});
  const { page, pageSize, skip, take } = paging(query, 20, 50);
  const type = query.get("type");
  const where: Prisma.NotificationWhereInput = {
    userId: session.id,
    ...(type && TYPES.includes(type) ? { type: type as NotificationType } : {}),
    ...(query.get("unread") === "1" ? { readAt: null } : {}),
  };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: session.id, readAt: null } }),
  ]);
  return { items, total, unread, page, pageSize };
});

export const POST = route({ body: z.object({ action: z.literal("read-all") }) }, async ({ session }) => {
  const r = await prisma.notification.updateMany({ where: { userId: session.id, readAt: null }, data: { readAt: new Date() } });
  return { ok: true, updated: r.count };
});
