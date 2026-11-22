import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/http-error";

/** Foydalanuvchi maydonlari (passwordHash HECH QACHON qaytarilmaydi). */
export const userSelect = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Bo'sh qiymat = o'chirish (null). `undefined` = o'zgartirmaslik. */
export const emailField = z
  .union([z.string().trim().max(120).email("Email noto'g'ri"), z.literal(""), z.null()])
  .optional();
export const phoneField = z
  .union([z.string().trim().max(32).regex(/^[+\d\s()\-]{5,32}$/, "Telefon raqami noto'g'ri"), z.literal(""), z.null()])
  .optional();

export const emptyToNull = (v: string | null | undefined) => (v === undefined ? undefined : v ? v : null);

/** Faol ADMIN'lar qatorlarini qulflaydi (poyga holatlariga qarshi) va sonini qaytaradi. */
export async function lockActiveAdmins(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;
  return rows.map((r) => r.id);
}

export function assertNotLastAdmin(adminIds: string[], targetId: string, message: string) {
  const others = adminIds.filter((id) => id !== targetId);
  if (adminIds.includes(targetId) && others.length === 0) throw new HttpError(409, message);
}

export function generatePassword(len = 12): string {
  // 12 belgi: harf + raqam kafolatlangan; o'xshash belgilar (0/O, 1/l/I) chiqarilgan
  const letters = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < len) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
