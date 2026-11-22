import { prisma, getClass, getSystemSettings } from "@/lib/db";
import { route } from "@/lib/api";
import { env } from "@/lib/env";
import { syncReminders } from "@/lib/notify";

// Joriy foydalanuvchi, sozlamalari va nishon (badge) sanoqlari. Navbar har 30 soniyada so'raydi.
export const GET = route({ guest: true }, async ({ session }) => {
  if (session.role === "GUEST") {
    // Mehmon: bazada hisob/sozlama yo'q — standart qiymatlar, hisoblagichlar nol
    const [sys, cls] = await Promise.all([getSystemSettings(), getClass()]);
    return {
      user: { id: session.id, username: session.username, fullName: session.fullName, role: "GUEST", avatarUrl: null, email: null, phone: null, lastLoginAt: null, mustChangePassword: false },
      settings: { theme: "system", language: sys.defaultLanguage ?? "uz", notifyAttendance: false, notifyHomework: false, notifyAnnouncements: false, notifyGrades: false, notifyTimetable: false, notifyEvents: false, notifyMessages: false, hiddenWidgets: [] },
      counts: { notifications: 0, messages: 0 },
      className: cls.name,
      schoolName: sys.schoolName,
      timezone: env.timezone,
    };
  }
  await syncReminders(session.id).catch(() => {});
  const [settings, sys, cls, notifications, unreadRows] = await Promise.all([
    prisma.userSettings.upsert({ where: { userId: session.id }, update: {}, create: { userId: session.id } }),
    getSystemSettings(),
    getClass(),
    prisma.notification.count({ where: { userId: session.id, readAt: null } }),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(m.id)::int AS n
      FROM "ThreadMember" tm
      JOIN "Message" m ON m."threadId" = tm."threadId"
        AND m."createdAt" > COALESCE(tm."lastReadAt", tm."joinedAt")
        AND m."senderId" IS DISTINCT FROM tm."userId"
      WHERE tm."userId" = ${session.id}`,
  ]);
  return {
    user: {
      id: session.id,
      username: session.username,
      fullName: session.fullName,
      role: session.role,
      avatarUrl: session.avatarUrl,
      email: session.email,
      phone: session.phone,
      lastLoginAt: session.lastLoginAt,
      mustChangePassword: session.mustChangePassword,
    },
    settings: {
      theme: settings.theme,
      language: settings.language,
      notifyAttendance: settings.notifyAttendance,
      notifyHomework: settings.notifyHomework,
      notifyAnnouncements: settings.notifyAnnouncements,
      notifyGrades: settings.notifyGrades,
      notifyTimetable: settings.notifyTimetable,
      notifyEvents: settings.notifyEvents,
      notifyMessages: settings.notifyMessages,
      hiddenWidgets: settings.hiddenWidgets,
    },
    counts: { notifications, messages: unreadRows[0]?.n ?? 0 },
    className: cls.name,
    schoolName: sys.schoolName,
    timezone: env.timezone,
  };
});
