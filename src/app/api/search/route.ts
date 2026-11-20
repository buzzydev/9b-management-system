import { prisma } from "@/lib/db";
import { route } from "@/lib/api";

const REPORT_TYPES = [
  { key: "attendance_daily", title: "Kunlik davomat hisoboti" },
  { key: "attendance_weekly", title: "Haftalik davomat hisoboti" },
  { key: "attendance_monthly", title: "Oylik davomat hisoboti" },
  { key: "student", title: "O'quvchi bo'yicha hisobot" },
  { key: "activity", title: "O'quvchi faolligi" },
];

// Global qidiruv: kategoriyalar bo'yicha guruhlangan natijalar (har biri 5 tagacha)
export const GET = route({ cap: "class.manage", rate: { name: "search", limit: 60, windowMs: 60_000 } }, async ({ query }) => {
  const q = (query.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return { students: [], announcements: [], events: [], reports: [] };
  const ci = { contains: q, mode: "insensitive" as const };
  const now = new Date();
  const [students, announcements, events] = await Promise.all([
    prisma.student.findMany({
      where: { OR: [{ fullName: ci }, { studentCode: ci }, { phone: ci }, { parentPhone: ci }] },
      select: { id: true, fullName: true, studentCode: true },
      orderBy: { fullName: "asc" },
      take: 5,
    }),
    prisma.announcement.findMany({
      where: { publishAt: { lte: now }, OR: [{ title: ci }, { body: ci }] },
      select: { id: true, title: true },
      orderBy: { publishAt: "desc" },
      take: 5,
    }),
    prisma.calendarEvent.findMany({
      where: { OR: [{ title: ci }, { description: ci }] },
      select: { id: true, title: true, startsAt: true },
      orderBy: { startsAt: "desc" },
      take: 5,
    }),
  ]);
  const ql = q.toLowerCase();
  return {
    students,
    announcements,
    events,
    reports: REPORT_TYPES.filter((r) => r.title.toLowerCase().includes(ql)).slice(0, 5),
  };
});
