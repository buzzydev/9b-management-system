import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, getClass } from "@/lib/db";
import { route, paging, HttpError } from "@/lib/api";
import { fmtDay, parseDay, todayStr } from "@/lib/dates";
import { notifyUsers } from "@/lib/notify";
import { dayString, id } from "@/lib/validators";

/** Qayd tarixi: faqat xodimlar (mehmon emas). Qayd o'zgartirilmaydi va o'chirilmaydi. */
export const GET = route({ cap: "class.manage" }, async ({ query }) => {
  const { page, pageSize, skip, take } = paging(query, 20, 100);
  const q = (query.get("q") ?? "").trim().slice(0, 80);
  const studentId = query.get("studentId");
  const createdById = query.get("createdById");
  const from = query.get("from");
  const to = query.get("to");
  const date = query.get("date"); // aniq sana bo'yicha qidirish
  const num = (k: string) => { const v = query.get(k); return v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null; };
  const minHours = num("minHours");
  const maxHours = num("maxHours");
  for (const d of [from, to, date]) if (d && !dayString.safeParse(d).success) throw new HttpError(400, "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");

  const where: Prisma.EscapeRecordWhereInput = {
    ...(q ? { OR: [{ studentName: { contains: q, mode: "insensitive" } }, { reason: { contains: q, mode: "insensitive" } }, { createdByName: { contains: q, mode: "insensitive" } }] } : {}),
    ...(studentId ? { studentId } : {}),
    ...(createdById ? { createdById } : {}),
    ...(date ? { date: parseDay(date) } : from || to ? { date: { ...(from ? { gte: parseDay(from) } : {}), ...(to ? { lte: parseDay(to) } : {}) } } : {}),
    ...(minHours !== null || maxHours !== null ? { hours: { ...(minHours !== null ? { gte: minHours } : {}), ...(maxHours !== null ? { lte: maxHours } : {}) } } : {}),
  };

  const [rows, total, agg, students, authors] = await Promise.all([
    prisma.escapeRecord.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip, take }),
    prisma.escapeRecord.count({ where }),
    prisma.escapeRecord.aggregate({ where, _sum: { hours: true } }),
    prisma.escapeRecord.groupBy({ by: ["studentId", "studentName"], orderBy: { studentName: "asc" } }),
    prisma.escapeRecord.groupBy({ by: ["createdById", "createdByName"], orderBy: { createdByName: "asc" } }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      studentName: r.studentName,
      date: fmtDay(r.date),
      hours: r.hours,
      reason: r.reason,
      createdAt: r.createdAt,
      createdByName: r.createdByName,
    })),
    total,
    page,
    pageSize,
    totalHours: Math.round((agg._sum.hours ?? 0) * 10) / 10,
    facets: {
      students: students.filter((s) => s.studentId).map((s) => ({ id: s.studentId as string, name: s.studentName })),
      authors: authors.filter((a) => a.createdById).map((a) => ({ id: a.createdById as string, name: a.createdByName })),
    },
  };
});

const createSchema = z.object({
  studentId: id,
  date: dayString,
  hours: z.number().finite().min(0.5, "Kamida 0,5 soat").max(24, "24 soatdan oshmasligi kerak"),
  reason: z.string().trim().min(10, "Izoh kamida 10 belgidan iborat bo'lishi kerak (sabab va qaysi vaqtda ketgani)").max(1000),
  /** Qayd kiritilishidan oldin foydalanuvchi oxirgi bosqichda tasdiqlaydi: UI true yuboradi, server esa buni majburan talab qiladi */
  confirmed: z.literal(true, { errorMap: () => ({ message: "Qayd tasdiqlanishi kerak" }) }),
});

/** «Qochib ketdi» qaydini yaratadi va (tasdiqdan keyin) o'quvchining shu sanadagi davomat holatini ESCAPED qiladi — bitta tranzaksiyada. Barcha xodimlar (ustoz, klasskom, yordamchi, admin) kirita oladi. */
export const POST = route({ cap: "class.manage", body: createSchema, rate: { name: "escape", limit: 60, windowMs: 3_600_000 } }, async ({ body, session, log }) => {
  const cls = await getClass();
  if (body.date > todayStr()) throw new HttpError(400, "Kelajak sanasi uchun qayd kiritib bo'lmaydi");
  const student = await prisma.student.findFirst({ where: { id: body.studentId, classId: cls.id, status: "ACTIVE" }, select: { id: true, fullName: true } });
  if (!student) throw new HttpError(404, "Faol o'quvchi topilmadi");
  const day = parseDay(body.date);
  const existing = await prisma.attendance.findUnique({ where: { studentId_date: { studentId: student.id, date: day } }, select: { status: true } });
  if (existing?.status === "ESCAPED" && session.role !== "ADMIN") throw new HttpError(409, "Bu o'quvchi shu kuni allaqachon «Qochib ketdi» deb belgilangan");
  const note = `Qochib ketdi (${body.hours} soat): ${body.reason}`.slice(0, 500);

  const record = await prisma.$transaction(async (tx) => {
    const rec = await tx.escapeRecord.create({
      data: { studentId: student.id, studentName: student.fullName, date: day, hours: body.hours, reason: body.reason, createdById: session.id, createdByName: session.fullName },
    });
    await tx.attendance.upsert({
      where: { studentId_date: { studentId: student.id, date: day } },
      create: { studentId: student.id, classId: cls.id, date: day, status: "ESCAPED", source: "MANUAL", note, markedById: session.id },
      update: { status: "ESCAPED", source: "MANUAL", note, markedById: session.id, qrSessionId: null },
    });
    await log(
      { action: "STUDENT_ESCAPED", category: "attendance", description: `${student.fullName} «Qochib ketdi» deb belgilandi (${body.date}, ${body.hours} soat): ${body.reason}`.slice(0, 900), entityType: "EscapeRecord", entityId: rec.id },
      tx,
    );
    return rec;
  });

  try {
    await notifyUsers({ type: "STUDENT_ABSENT", title: `Qochib ketdi: ${student.fullName}`, body: `${body.date} · ${body.hours} soat`, link: "/escapes", dedupeKey: `escape:${record.id}`, excludeUserId: session.id });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "escape-notify-failed", err: String(e) }));
  }
  return { ok: true, id: record.id };
});
