import { z } from "zod";
import { prisma, getClass } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { notifyUsers } from "@/lib/notify";
import { fmtDay, isDayString, parseDay, todayStr } from "@/lib/dates";
import { attendanceRate, tally, type AttendanceStatusKey } from "@/lib/stats";
import { attendanceStatusEnum, dayString, id } from "@/lib/validators";

export const GET = route({ cap: "class.manage", guest: true }, async ({ query, session }) => {
  const guest = session.role === "GUEST";
  const cls = await getClass();
  const dateParam = query.get("date");
  const date = dateParam && isDayString(dateParam) ? dateParam : todayStr();
  const day = parseDay(date);

  const [students, records, qr] = await Promise.all([
    prisma.student.findMany({
      where: { classId: cls.id, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, studentCode: true, photoUrl: true },
    }),
    prisma.attendance.findMany({
      where: { classId: cls.id, date: day },
      select: { studentId: true, status: true, note: true, source: true, updatedAt: true },
    }),
    prisma.qrSession.findFirst({
      where: { classId: cls.id, date: day, closedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, expiresAt: true, scans: true },
    }),
  ]);

  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const items = students.map((s) => {
    const r = byStudent.get(s.id);
    const status = (r?.status ?? null) as AttendanceStatusKey | null;
    // Mehmonga faqat ism va holat: ID raqami, rasm, izoh va manba yuborilmaydi
    return guest ? { id: s.id, fullName: s.fullName, studentCode: "", photoUrl: null, status, note: null, source: null } : { ...s, status, note: r?.note ?? null, source: r?.source ?? null };
  });
  const activeIds = new Set(students.map((s) => s.id));
  const counts = tally(records.filter((r) => activeIds.has(r.studentId)) as { status: AttendanceStatusKey }[]);
  const marked = items.filter((i) => i.status).length;

  return {
    date,
    isToday: date === todayStr(),
    items,
    summary: { total: students.length, marked, unmarked: students.length - marked, ...counts },
    rate: attendanceRate(counts),
    qrSession: !guest && qr ? { id: qr.id, expiresAt: qr.expiresAt, scans: qr.scans } : null,
  };
});

const putSchema = z.object({
  date: dayString,
  entries: z
    .array(
      z.object({
        studentId: id,
        status: attendanceStatusEnum,
        note: z
          .string()
          .trim()
          .max(300)
          .nullish()
          .transform((v) => (v ? v : null)),
      }),
    )
    .min(1, "Hech narsa belgilanmadi")
    .max(300),
});

export const PUT = route({ cap: "class.manage", body: putSchema }, async ({ body, session, log }) => {
  if (body.date > todayStr()) throw new HttpError(400, "Kelajak sana uchun davomat belgilab bo'lmaydi");
  const cls = await getClass();
  const day = parseDay(body.date);

  // Takroriy o'quvchilar: oxirgisi hisobga olinadi
  const entries = [...new Map(body.entries.map((e) => [e.studentId, e])).values()];

  const students = await prisma.student.findMany({
    where: { id: { in: entries.map((e) => e.studentId) }, classId: cls.id, status: "ACTIVE" },
    select: { id: true, fullName: true },
  });
  const nameOf = new Map(students.map((s) => [s.id, s.fullName]));
  if (nameOf.size !== entries.length) throw new HttpError(400, "Ba'zi o'quvchilar topilmadi yoki arxivlangan");

  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.attendance.findMany({
        where: { date: day, studentId: { in: entries.map((e) => e.studentId) } },
        select: { studentId: true, status: true, note: true },
      });
      const prev = new Map(existing.map((r) => [r.studentId, r]));
      // O'zgarmagan yozuvlarga tegilmaydi (QR manbasi saqlanib qoladi)
      const changed = entries.filter((e) => {
        const p = prev.get(e.studentId);
        return !p || p.status !== e.status || (p.note ?? null) !== e.note;
      });
      // «Qochib ketdi» holatini faqat administrator o'zgartira oladi
      if (session.role !== "ADMIN" && changed.some((e) => prev.get(e.studentId)?.status === "ESCAPED")) {
        throw new HttpError(403, "«Qochib ketdi» holatini faqat administrator o'zgartira oladi");
      }
      for (const e of changed) {
        await tx.attendance.upsert({
          where: { studentId_date: { studentId: e.studentId, date: day } },
          create: { studentId: e.studentId, classId: cls.id, date: day, status: e.status, note: e.note, source: "MANUAL", markedById: session.id },
          update: { status: e.status, note: e.note, source: "MANUAL", markedById: session.id, qrSessionId: null },
        });
      }
      const counts = tally(entries as { status: AttendanceStatusKey }[]);
      const newAbsent = changed.filter((e) => e.status === "ABSENT" && prev.get(e.studentId)?.status !== "ABSENT").map((e) => e.studentId);
      if (changed.length) {
        await log(
          {
            action: "ATTENDANCE_SAVE",
            category: "attendance",
            description: `Davomat saqlandi (${body.date}): ${changed.length} ta o'zgarish — keldi ${counts.PRESENT}, kelmadi ${counts.ABSENT}, kechikdi ${counts.LATE}, sababli ${counts.EXCUSED}`,
            entityType: "Attendance",
            entityId: body.date,
          },
          tx,
        );
      }
      return { changed: changed.length, created: changed.filter((e) => !prev.has(e.studentId)).length, newAbsent };
    },
    { timeout: 30_000 },
  );

  if (result.changed > 0) {
    try {
      await notifyUsers({
        type: "ATTENDANCE_SAVED",
        title: `Davomat saqlandi: ${body.date}`,
        body: `${session.fullName} ${result.changed} ta yozuvni yangiladi`,
        link: "/attendance",
        dedupeKey: `att-saved:${body.date}`,
        excludeUserId: session.id,
      });
      for (const sid of result.newAbsent) {
        await notifyUsers({
          type: "STUDENT_ABSENT",
          title: `Kelmadi: ${nameOf.get(sid)}`,
          body: body.date,
          link: `/students/${sid}`,
          dedupeKey: `absent:${sid}:${body.date}`,
          excludeUserId: session.id,
        });
      }
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "attendance-notify-failed", err: String(e) }));
    }
  }

  return { ok: true, saved: result.changed, date: body.date, day: fmtDay(day) };
});
