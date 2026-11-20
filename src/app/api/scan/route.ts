import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publicRoute, HttpError } from "@/lib/api";
import { logActivity } from "@/lib/audit";
import { enforceRate } from "@/lib/rate-limit";
import { checkQrSession, hashToken } from "@/lib/qr";
import { fmtDay, todayStr } from "@/lib/dates";
import { dayString } from "@/lib/validators";

const GENERIC = "Ma'lumotlar noto'g'ri";

function reasonError(reason: "closed" | "expired" | "wrong_day") {
  if (reason === "closed") return new HttpError(410, "Bu QR sessiya yopilgan", "QR_CLOSED");
  if (reason === "expired") return new HttpError(410, "QR kodning muddati tugagan", "QR_EXPIRED");
  return new HttpError(410, "Bu QR kod boshqa kunga tegishli", "QR_WRONG_DAY");
}

const tokenSchema = z.string().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const GET = publicRoute({ rate: { name: "scan-check", limit: 120, windowMs: 10 * 60_000 } }, async ({ query }) => {
  const parsed = tokenSchema.safeParse(query.get("token") ?? "");
  if (!parsed.success) return { valid: false, reason: "invalid" };
  const s = await prisma.qrSession.findUnique({ where: { tokenHash: hashToken(parsed.data) }, include: { class: { select: { name: true } } } });
  if (!s) return { valid: false, reason: "invalid" };
  const check = checkQrSession(s, new Date(), todayStr());
  if (!check.ok) return { valid: false, reason: check.reason, className: s.class.name };
  return { valid: true, className: s.class.name, expiresAt: s.expiresAt };
});

const scanSchema = z.object({
  token: tokenSchema,
  studentCode: z.string().trim().min(1, "Student ID kiriting").max(32),
  dateOfBirth: dayString,
});

export const POST = publicRoute({ body: scanSchema, rate: { name: "scan", limit: 20, windowMs: 10 * 60_000 } }, async ({ body, ip }) => {
  const tokenHash = hashToken(body.token);
  enforceRate(`scan-token:${tokenHash}`, 300, 10 * 60_000);
  const code = body.studentCode.toUpperCase();
  // Bitta ID uchun tug'ilgan sanani terib topishga urinishlarni cheklaymiz
  enforceRate(`scan-code:${tokenHash}:${code}`, 8, 10 * 60_000);

  const session = await prisma.qrSession.findUnique({ where: { tokenHash } });
  if (!session) throw new HttpError(404, "QR kod yaroqsiz", "QR_INVALID");
  const check = checkQrSession(session, new Date(), todayStr());
  if (!check.ok) throw reasonError(check.reason);

  const student = await prisma.student.findFirst({ where: { studentCode: code, classId: session.classId, status: "ACTIVE" } });
  // Sana bazada bo'lishi va mos kelishi shart; har qanday nomuvofiqlik uchun bir xil xato
  if (!student || !student.dateOfBirth || fmtDay(student.dateOfBirth) !== body.dateOfBirth) throw new HttpError(400, GENERIC, "BAD_CREDENTIALS");

  const existing = await prisma.attendance.findUnique({ where: { studentId_date: { studentId: student.id, date: session.date } } });
  if (existing) throw new HttpError(409, "Davomat allaqachon belgilangan", "ALREADY_MARKED");

  const status = check.late ? "LATE" : "PRESENT";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.attendance.create({
        data: { studentId: student.id, classId: session.classId, date: session.date, status, source: "QR", qrSessionId: session.id },
      });
      await tx.qrSession.update({ where: { id: session.id }, data: { scans: { increment: 1 } } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "Davomat allaqachon belgilangan", "ALREADY_MARKED");
    throw e;
  }

  await logActivity({
    userName: `QR: ${student.fullName}`,
    action: "QR_ATTENDANCE",
    category: "attendance",
    description: `QR orqali davomat: ${student.fullName} — ${status === "LATE" ? "kechikdi" : "keldi"} (${fmtDay(session.date)})`,
    entityType: "Attendance",
    entityId: student.id,
    ip,
  });

  return { ok: true, status, studentName: student.fullName };
});
