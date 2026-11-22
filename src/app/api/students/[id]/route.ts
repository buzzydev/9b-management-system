import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { notFound } from "@/lib/http-error";
import { can } from "@/lib/permissions";
import { fmtDay, parseDay, today, addDays } from "@/lib/dates";
import { attendanceRate, emptyCounts, tally, type AttendanceStatusKey } from "@/lib/stats";
import { studentDuty } from "@/lib/services/duty";
import { assertDobValid, serializeStudent, studentInput } from "@/lib/services/students";

export const GET = route({ cap: "class.manage" }, async ({ params }) => {
  const id = params.id;
  const s = await prisma.student.findUnique({ where: { id }, include: { class: true } });
  if (!s) throw notFound("O'quvchi topilmadi");

  const [attRows, notes, duty] = await Promise.all([
    prisma.attendance.findMany({ where: { studentId: id }, orderBy: { date: "desc" }, select: { id: true, date: true, status: true, note: true, source: true } }),
    prisma.teacherNote.findMany({ where: { studentId: id }, orderBy: { createdAt: "desc" }, take: 100, include: { author: { select: { fullName: true } } } }),
    studentDuty(id),
  ]);

  const counts = tally(attRows as { status: AttendanceStatusKey }[]);
  const absences = attRows.filter((r) => r.status === "ABSENT" || r.status === "EXCUSED" || r.status === "ESCAPED").slice(0, 50).map((r) => ({ id: r.id, date: fmtDay(r.date), status: r.status, note: r.note }));
  const lates = attRows.filter((r) => r.status === "LATE").slice(0, 50).map((r) => ({ id: r.id, date: fmtDay(r.date), status: r.status, note: r.note }));

  // Oxirgi 12 oy bo'yicha oylik qator
  const from = addDays(today(), -365);
  const byMonth = new Map<string, ReturnType<typeof emptyCounts>>();
  for (const r of attRows) {
    if (r.date < from) continue;
    const m = fmtDay(r.date).slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, emptyCounts());
    byMonth.get(m)![r.status as AttendanceStatusKey] += 1;
  }
  const monthly = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, c]) => ({ month, counts: c, rate: attendanceRate(c) }));

  return {
    student: { ...serializeStudent(s), className: s.class.name },
    attendance: { counts, rate: attendanceRate(counts), total: attRows.length },
    absences,
    lates,
    monthly,
    duty,
    notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, author: n.author?.fullName ?? "—" })),
  };
});

const patchSchema = studentInput.extend({ status: z.enum(["ACTIVE", "ARCHIVED"]).optional() });

export const PATCH = route({ cap: "class.manage", body: patchSchema }, async ({ params, body, log }) => {
  const bad = assertDobValid(body.dateOfBirth);
  if (bad) throw new HttpError(400, bad);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.student.findUnique({ where: { id: params.id } });
      if (!before) throw notFound("O'quvchi topilmadi");
      const s = await tx.student.update({
        where: { id: params.id },
        data: {
          fullName: body.fullName,
          ...(body.studentCode ? { studentCode: body.studentCode } : {}),
          photoUrl: body.photoUrl,
          dateOfBirth: body.dateOfBirth ? parseDay(body.dateOfBirth) : null,
          phone: body.phone,
          parentPhone: body.parentPhone,
          ...(body.enrolledAt ? { enrolledAt: parseDay(body.enrolledAt) } : {}),
          notes: body.notes,
          ...(body.status ? { status: body.status, archivedAt: body.status === "ARCHIVED" ? new Date() : null } : {}),
        },
      });
      const changed = (["fullName", "studentCode", "phone", "parentPhone", "notes", "status"] as const).filter((k) => before[k] !== s[k]);
      await log({ action: "STUDENT_UPDATE", category: "student", description: `O'quvchi tahrirlandi: ${s.fullName}${changed.length ? ` (${changed.join(", ")})` : ""}`, entityType: "Student", entityId: s.id }, tx);
      return s;
    });
    return { student: serializeStudent(updated) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "Bu ID boshqa o'quvchida mavjud");
    throw e;
  }
});

// Standart: arxivlash. ?permanent=1 — butunlay o'chirish (faqat Admin, barcha bog'liq yozuvlar bilan)
export const DELETE = route({ cap: "class.manage" }, async ({ params, query, session, log }) => {
  const permanent = query.get("permanent") === "1";
  if (permanent && !can(session.role, "students.purge")) throw new HttpError(403, "Butunlay o'chirish faqat Administratorga ruxsat etilgan");
  const s = await prisma.student.findUnique({ where: { id: params.id } });
  if (!s) throw notFound("O'quvchi topilmadi");
  if (permanent) {
    await prisma.$transaction(async (tx) => {
      await tx.student.delete({ where: { id: s.id } });
      await log({ action: "STUDENT_DELETE", category: "student", description: `O'quvchi butunlay o'chirildi: ${s.fullName} (${s.studentCode})`, entityType: "Student", entityId: s.id }, tx);
    });
    return { ok: true, deleted: true };
  }
  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: s.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await log({ action: "STUDENT_ARCHIVE", category: "student", description: `O'quvchi arxivlandi: ${s.fullName}`, entityType: "Student", entityId: s.id }, tx);
  });
  return { ok: true, archived: true };
});
