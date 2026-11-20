import { prisma, getClass, getSystemSettings } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { env } from "@/lib/env";
import { today } from "@/lib/dates";
import { generateQrToken, hashToken } from "@/lib/qr";

function originOf(req: Request & { nextUrl: URL }) {
  if (env.trustProxy) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.replace(":", "");
    if (host) return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}

export const POST = route({ cap: "class.manage", rate: { name: "qr-create", limit: 30, windowMs: 10 * 60_000 } }, async ({ req, session, log }) => {
  const cls = await getClass();
  const settings = await getSystemSettings();
  const token = generateQrToken();
  const now = Date.now();
  const expiresAt = new Date(now + settings.qrTtlMinutes * 60_000);
  const lateAfter = new Date(now + settings.qrLateAfterMinutes * 60_000);

  const created = await prisma.$transaction(async (tx) => {
    const s = await tx.qrSession.create({
      data: { tokenHash: hashToken(token), classId: cls.id, date: today(), createdById: session.id, expiresAt, lateAfter },
    });
    await log(
      { action: "QR_SESSION_CREATE", category: "attendance", description: `QR davomat sessiyasi ochildi (${settings.qrTtlMinutes} daqiqa)`, entityType: "QrSession", entityId: s.id },
      tx,
    );
    return s;
  });

  return { sessionId: created.id, token, url: `${originOf(req)}/scan/${token}`, expiresAt, lateAfter };
});

export const GET = route({ cap: "class.manage" }, async ({ query }) => {
  const sessionId = query.get("sessionId");
  if (!sessionId) throw new HttpError(400, "sessionId kerak");
  const s = await prisma.qrSession.findUnique({
    where: { id: sessionId },
    select: { id: true, scans: true, expiresAt: true, closedAt: true, date: true, attendance: { orderBy: { updatedAt: "desc" }, select: { status: true, student: { select: { fullName: true } } } } },
  });
  if (!s) throw new HttpError(404, "Sessiya topilmadi");
  const scanned = s.attendance.map((a) => a.student.fullName);
  return { scans: s.scans, expiresAt: s.expiresAt, closedAt: s.closedAt, scanned };
});

export const DELETE = route({ cap: "class.manage" }, async ({ query, log }) => {
  const sessionId = query.get("sessionId");
  if (!sessionId) throw new HttpError(400, "sessionId kerak");
  await prisma.$transaction(async (tx) => {
    const s = await tx.qrSession.findUnique({ where: { id: sessionId } });
    if (!s) throw new HttpError(404, "Sessiya topilmadi");
    if (s.closedAt) return;
    await tx.qrSession.update({ where: { id: sessionId }, data: { closedAt: new Date() } });
    await log({ action: "QR_SESSION_CLOSE", category: "attendance", description: `QR davomat sessiyasi yopildi (${s.scans} ta skan)`, entityType: "QrSession", entityId: s.id }, tx);
  });
  return { ok: true };
});
