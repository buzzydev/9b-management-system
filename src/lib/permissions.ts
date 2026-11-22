import type { Role } from "@prisma/client";

export type Capability =
  | "class.manage" // talabalar, davomat, jadval, uy vazifa, baho, kalendar, e'lon, yutuq, hisobot, jurnal (ko'rish)
  | "users.manage"
  | "system.manage"
  | "backup.manage"
  | "students.purge"
  | "logs.all"
  | "duty.manage"; // navbatchilarni boshqarish — faqat administrator

const ADMIN_ONLY: Capability[] = ["users.manage", "system.manage", "backup.manage", "students.purge", "logs.all", "duty.manage"];

export function can(role: Role | "GUEST", cap: Capability): boolean {
  if (role === "GUEST") return false; // mehmon hech qachon hech narsani boshqara olmaydi
  if (role === "ADMIN") return true;
  if (ADMIN_ONLY.includes(cap)) return false;
  // Barcha to'rt rol sinf boshqaruvi imkoniyatlariga ega
  return cap === "class.manage";
}

/** Admin bo'lmagan rollar ko'ra oladigan jurnal kategoriyalari (autentifikatsiya/foydalanuvchi/tizim sozlamalari yashirin). */
export const CLASS_LOG_CATEGORIES = [
  "student",
  "attendance",
  "announcement",
  "timetable",
  "calendar",
  "duty",
  "subject",
  "report",
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  TEACHER: "Ustoz",
  CLASS_LEADER: "Klasskom",
  ASSISTANT: "Klasskom yordamchisi",
};
