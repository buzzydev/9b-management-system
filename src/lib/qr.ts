import { createHash, randomBytes } from "node:crypto";

/** 256-bitli tasodifiy token (URL-xavfsiz). Bazada faqat SHA-256 hash saqlanadi. */
export function generateQrToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type QrCheck = { ok: true; late: boolean } | { ok: false; reason: "closed" | "expired" | "wrong_day" };

/** Sof tekshiruv: sessiya yopilmagan, muddati o'tmagan, bugungi kunga tegishli; kechikish vaqti hisoblanadi. */
export function checkQrSession(
  s: { closedAt: Date | null; expiresAt: Date; lateAfter: Date | null; date: Date },
  now: Date,
  todayDay: string,
): QrCheck {
  if (s.closedAt) return { ok: false, reason: "closed" };
  if (s.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (s.date.toISOString().slice(0, 10) !== todayDay) return { ok: false, reason: "wrong_day" };
  return { ok: true, late: !!s.lateAfter && now.getTime() > s.lateAfter.getTime() };
}
