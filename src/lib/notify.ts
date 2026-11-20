import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { addDays } from "./dates";

const SETTING_FIELD: Partial<Record<NotificationType, string>> = {
  ATTENDANCE_SAVED: "notifyAttendance",
  STUDENT_ABSENT: "notifyAttendance",
  HOMEWORK_ASSIGNED: "notifyHomework",
  HOMEWORK_DEADLINE: "notifyHomework",
  NEW_ANNOUNCEMENT: "notifyAnnouncements",
  GRADE_UPDATED: "notifyGrades",
  TIMETABLE_CHANGED: "notifyTimetable",
  UPCOMING_EXAM: "notifyEvents",
  MESSAGE: "notifyMessages",
};

export type NotifyParams = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Bir xil kalit bilan takroriy bildirishnoma yaratilmaydi (foydalanuvchi bo'yicha) */
  dedupeKey?: string;
  excludeUserId?: string;
  userIds?: string[];
  client?: Prisma.TransactionClient;
};

/** Faol foydalanuvchilarga (ularning bildirishnoma sozlamalariga rioya qilib) DB-bildirishnoma yaratadi. */
export async function notifyUsers(p: NotifyParams): Promise<number> {
  const db = p.client ?? prisma;
  const users = await db.user.findMany({
    where: {
      isActive: true,
      ...(p.userIds ? { id: { in: p.userIds } } : {}),
      ...(p.excludeUserId ? { id: { not: p.excludeUserId } } : {}),
    },
    select: { id: true, settings: true },
  });
  const field = SETTING_FIELD[p.type];
  const targets = users.filter((u) => {
    if (!field || !u.settings) return true;
    return (u.settings as unknown as Record<string, boolean>)[field] !== false;
  });
  if (!targets.length) return 0;
  const res = await db.notification.createMany({
    data: targets.map((u) => ({
      userId: u.id,
      type: p.type,
      title: p.title.slice(0, 200),
      body: p.body?.slice(0, 500),
      link: p.link,
      dedupeKey: p.dedupeKey,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

const lastSync = new Map<string, number>();

/**
 * Muddatga bog'liq bildirishnomalarni (cron'siz) so'rov vaqtida yaratadi:
 * - 48 soat ichidagi imtihon/testlar va eslatma vaqti kelgan tadbirlar
 * - rejalashtirilgan e'lonlar chop etilgach
 * dedupeKey tufayli takrorlanmaydi. Foydalanuvchi uchun daqiqasiga bir marta.
 */
export async function syncReminders(userId: string) {
  const now = Date.now();
  if ((lastSync.get(userId) ?? 0) > now - 60_000) return;
  lastSync.set(userId, now);

  const nowD = new Date(now);
  const [events, anns, me] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startsAt: { gte: nowD, lte: addDays(nowD, 2) } },
      select: { id: true, title: true, type: true, startsAt: true, reminderMinutes: true },
    }),
    prisma.announcement.findMany({
      where: { publishAt: { gt: addDays(nowD, -7), lte: nowD } },
      select: { id: true, title: true, priority: true, authorId: true },
    }),
    prisma.userSettings.findUnique({ where: { userId } }),
  ]);

  const rows: Prisma.NotificationCreateManyInput[] = [];
  if (!me || me.notifyEvents)
    for (const e of events) {
      const isExam = e.type === "EXAM" || e.type === "TEST";
      const due = e.reminderMinutes != null ? e.startsAt.getTime() - e.reminderMinutes * 60_000 <= now : isExam;
      if (!due) continue;
      rows.push({
        userId,
        type: "UPCOMING_EXAM",
        title: `Yaqinlashmoqda: ${e.title}`,
        body: e.startsAt.toISOString(),
        link: "/calendar",
        dedupeKey: `event:${e.id}`,
      });
    }
  if (!me || me.notifyAnnouncements)
    for (const a of anns) {
      if (a.authorId === userId) continue;
      rows.push({
        userId,
        type: "NEW_ANNOUNCEMENT",
        title: `Yangi e'lon: ${a.title}`,
        link: "/announcements",
        dedupeKey: `ann:${a.id}`,
      });
    }
  if (rows.length) await prisma.notification.createMany({ data: rows, skipDuplicates: true });
}
