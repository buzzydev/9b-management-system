import { z } from "zod";
import type { Prisma, Student } from "@prisma/client";
import { prisma, getClass } from "@/lib/db";
import { fmtDay, today } from "@/lib/dates";
import { attendanceRate, emptyCounts, type AttendanceStatusKey, type Counts } from "@/lib/stats";
import { optionalDay, optionalText, phone, photoUrl, requiredText } from "@/lib/validators";

/** Forma maydonlari. PATCH ham to'liq yangilash sifatida ishlaydi (UI hamma maydonni yuboradi). */
export const studentInput = z.object({
  fullName: requiredText(120),
  studentCode: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9._-]*$/, "ID faqat lotin harflari, raqam, nuqta, tire va pastki chiziqdan iborat bo'lishi kerak")
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  dateOfBirth: optionalDay,
  phone,
  parentPhone: phone,
  enrolledAt: optionalDay,
  notes: optionalText(2000),
  photoUrl,
});
export type StudentInput = z.infer<typeof studentInput>;

export function serializeStudent(s: Student, extra?: { attendanceRate?: number | null; counts?: Counts }) {
  return {
    id: s.id,
    studentCode: s.studentCode,
    fullName: s.fullName,
    photoUrl: s.photoUrl,
    dateOfBirth: s.dateOfBirth ? fmtDay(s.dateOfBirth) : null,
    phone: s.phone,
    parentPhone: s.parentPhone,
    enrolledAt: fmtDay(s.enrolledAt),
    notes: s.notes,
    status: s.status,
    createdAt: s.createdAt,
    ...extra,
  };
}

function yearsAgo(n: number): Date {
  const t = today();
  return new Date(Date.UTC(t.getUTCFullYear() - n, t.getUTCMonth(), t.getUTCDate()));
}

/** Ro'yxat va eksport uchun umumiy filtr */
export function studentWhere(q: URLSearchParams, classId: string): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = { classId };
  const status = q.get("status") ?? "ACTIVE";
  if (status === "ACTIVE" || status === "ARCHIVED") where.status = status;
  const term = (q.get("q") ?? "").trim().slice(0, 80);
  if (term) {
    const ci = { contains: term, mode: "insensitive" as const };
    where.OR = [{ fullName: ci }, { studentCode: ci }, { phone: ci }, { parentPhone: ci }];
  }
  const hp = q.get("hasPhone");
  if (hp === "yes") where.phone = { not: null };
  if (hp === "no") where.phone = null;
  const hpp = q.get("hasParentPhone");
  if (hpp === "yes") where.parentPhone = { not: null };
  if (hpp === "no") where.parentPhone = null;
  const ageMin = parseInt(q.get("ageMin") ?? "", 10);
  const ageMax = parseInt(q.get("ageMax") ?? "", 10);
  const dob: Prisma.DateTimeNullableFilter = {};
  if (Number.isFinite(ageMin)) dob.lte = yearsAgo(ageMin);
  if (Number.isFinite(ageMax)) dob.gt = yearsAgo(ageMax + 1);
  if (Object.keys(dob).length) where.dateOfBirth = dob;
  return where;
}

/** Berilgan o'quvchilar uchun davomat sanoqlari va foizi */
export async function attendanceMap(ids: string[]) {
  const map = new Map<string, { counts: Counts; rate: number | null }>();
  if (!ids.length) return map;
  const rows = await prisma.attendance.groupBy({ by: ["studentId", "status"], where: { studentId: { in: ids } }, _count: { _all: true } });
  for (const id of ids) map.set(id, { counts: emptyCounts(), rate: null });
  for (const r of rows) map.get(r.studentId)!.counts[r.status as AttendanceStatusKey] = r._count._all;
  for (const v of map.values()) v.rate = attendanceRate(v.counts);
  return map;
}

export async function classPrefix() {
  const cls = await getClass();
  return cls.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "ST";
}

/** Keyingi n ta bo'sh ID (9B-001, 9B-002 …). Poyga bo'lsa unique constraint → chaqiruvchi qayta urinadi. */
export async function nextCodes(tx: Prisma.TransactionClient, n: number): Promise<string[]> {
  const prefix = await classPrefix();
  const rows = await tx.student.findMany({ where: { studentCode: { startsWith: `${prefix}-` } }, select: { studentCode: true } });
  let max = 0;
  for (const r of rows) {
    const m = r.studentCode.match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return Array.from({ length: n }, (_, i) => `${prefix}-${String(max + i + 1).padStart(3, "0")}`);
}

export function assertDobValid(dob: string | null) {
  if (dob && dob >= fmtDay(today())) return "Tug'ilgan sana kelajakda bo'lishi mumkin emas";
  return null;
}
