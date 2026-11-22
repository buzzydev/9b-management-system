import { z } from "zod";
import { prisma, getClass } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
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

export const PATCH = route({ cap: "class.manage", body: lesson }, async ({ body, params, session, log }) => {
  const cls = await getClass();
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.timetable.findFirst({ where: { id: params.id, classId: cls.id } });
    if (!current) throw new HttpError(404, "Dars topilmadi");
    const existing = await tx.timetable.findMany({ where: { classId: cls.id, weekday: body.weekday } });
    const conflict = findConflict(existing, { ...body, id: params.id });
    if (conflict) throw new HttpError(409, conflict, "CONFLICT");
    const row = await tx.timetable.update({ where: { id: params.id }, data: body, include: { subject: true } });
    await log({ action: "TIMETABLE_UPDATE", category: "timetable", description: `Jadval o'zgartirildi: ${row.subject.name}, ${row.weekday}-kun, ${row.lessonNumber}-dars`, entityType: "Timetable", entityId: row.id }, tx);
    return row;
  });
  await notifyUsers({ type: "TIMETABLE_CHANGED", title: "Dars jadvali o'zgardi", body: `${updated.subject.name} yangilandi`, link: "/timetable", excludeUserId: session.id });
  return { entry: updated };
});

export const DELETE = route({ cap: "class.manage" }, async ({ params, session, log }) => {
  const cls = await getClass();
  const removed = await prisma.$transaction(async (tx) => {
    const row = await tx.timetable.findFirst({ where: { id: params.id, classId: cls.id }, include: { subject: true } });
    if (!row) throw new HttpError(404, "Dars topilmadi");
    await tx.timetable.delete({ where: { id: row.id } });
    await log({ action: "TIMETABLE_DELETE", category: "timetable", description: `Jadvaldan dars o'chirildi: ${row.subject.name}, ${row.weekday}-kun, ${row.lessonNumber}-dars`, entityType: "Timetable", entityId: row.id }, tx);
    return row;
  });
  await notifyUsers({ type: "TIMETABLE_CHANGED", title: "Dars jadvali o'zgardi", body: `${removed.subject.name} olib tashlandi`, link: "/timetable", excludeUserId: session.id });
  return { ok: true };
});
