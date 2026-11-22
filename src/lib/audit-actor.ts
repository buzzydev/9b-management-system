// Audit jurnali uchun aktyorni xavfsiz aniqlash. Faqat tip importlari — testlarda ham, Edge'da ham ishlaydi.
import type { Role } from "@prisma/client";

export type AuditUser = { id: string; fullName: string; role: Role };
export type SessionLike = { id: string; fullName: string; role: Role | "GUEST" };
export type AuditActor = { user: AuditUser | null; userName?: string };

export const GUEST_AUDIT_NAME = "Mehmon";

/**
 * Sessiyadan jurnal aktyorini yasaydi.
 * MEHMON hech qachon foydalanuvchi (userId/rol) sifatida yozilmaydi: user = null, nomi "Mehmon".
 * Faqat id, ism va rol olinadi — email/telefon kabi boshqa maydonlar jurnalga o'tmaydi.
 */
export function auditActor(session: SessionLike | null | undefined): AuditActor {
  if (!session) return { user: null };
  if (session.role === "GUEST") return { user: null, userName: GUEST_AUDIT_NAME };
  return { user: { id: session.id, fullName: session.fullName, role: session.role } };
}

/** Oxirgi himoya (runtime): tip tizimini chetlab o'tgan "GUEST" user'ni ham rad etadi. */
export function normalizeAuditUser(user: { id: string; fullName: string; role: string } | null | undefined): AuditUser | null {
  if (!user || user.role === "GUEST" || user.id === "guest") return null;
  return { id: user.id, fullName: user.fullName, role: user.role as Role };
}
