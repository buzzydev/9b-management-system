import { z } from "zod";
import { prisma, getClass } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { localParts } from "@/lib/dates";
import { findConflict, TIME_RE } from "@/lib/timetable";
import { notifyUsers } from "@/lib/notify";
import { id, requiredText, optionalText } from "@/lib/validators";

const lesson = z.object({
  weekday: z.number().int().min(1).max(6),
  lessonNumber: z.number().int().min(1).max(12),
  subjectId: id,
  teacherName: requiredText(100),
  room: optionalText(30),
  startTime: z.string().regex(TIME_RE, "Vaqt HH:mm ko'rinishida bo'lishi kerak"),
  endTime: z.string().regex(TIME_RE, "Vaqt HH:mm ko'rinishida bo'lishi kerak"),
});

export const GET = route({ cap: "class.manage", guest: true }, async () => {
  const cls = await getClass();
  const [entries, subjects] = await Promise.all([
    prisma.timetable.findMany({
      where: { classId: cls.id },
      orderBy: [{ weekday: "asc" }, { lessonNumber: "asc" }],
      include: { subject: { select: { id: true, name: true, shortName: true } } },
    }),
    prisma.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
  ]);
  return { entries, subjects, now: localParts() };
});

export const POST = route({ cap: "class.manage", body: lesson }, async ({ body, session, log }) => {
  const cls = await getClass();
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.timetable.findMany({ where: { classId: cls.id, weekday: body.weekday } });
    const conflict = findConflict(existing, body);
    if (conflict) throw new HttpError(409, conflict, "CONFLICT");
    const row = await tx.timetable.create({ data: { ...body, classId: cls.id }, include: { subject: true } });
    await log({ action: "TIMETABLE_CREATE", category: "timetable", description: `Jadvalga dars qo'shildi: ${row.subject.name}, ${row.weekday}-kun, ${row.lessonNumber}-dars`, entityType: "Timetable", entityId: row.id }, tx);
    return row;
  });
  await notifyUsers({ type: "TIMETABLE_CHANGED", title: "Dars jadvali o'zgardi", body: `${created.subject.name} qo'shildi`, link: "/timetable", excludeUserId: session.id });
  return { entry: created };
});
