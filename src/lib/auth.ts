import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { SESSION_COOKIE } from "./session-constants";

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role | "GUEST";
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
};

const BCRYPT_COST = 12;
// Foydalanuvchi mavjud bo'lmaganda ham bir xil vaqt sarflash uchun (timing hujumlariga qarshi)
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8e3y5lO7fVbFZb2o1m2bqk7QzS5yWy";

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, BCRYPT_COST);
}

export async function verifyPassword(pw: string, hash: string | null | undefined) {
  return bcrypt.compare(pw, hash ?? DUMMY_HASH).then((ok) => ok && !!hash);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 8) return "Parol kamida 8 belgidan iborat bo'lishi kerak";
  if (pw.length > 128) return "Parol juda uzun";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Parolda kamida bitta harf va bitta raqam bo'lishi kerak";
  return null;
}

const key = () => new TextEncoder().encode(env.authSecret);

export async function createSession(user: { id: string; passwordChangedAt: Date }) {
  const hours = env.sessionHours;
  const token = await new SignJWT({ pv: user.passwordChangedAt.getTime() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(key());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: hours * 3600,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", maxAge: 0 });
}

/** Har so'rovda bazadan tekshiradi: faol hisob, rol o'zgarishi, parol o'zgargach eski sessiyalar bekor. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return null;
    if (payload.pv !== user.passwordChangedAt.getTime()) return null;
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      email: user.email,
      phone: user.phone,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
    };
  } catch {
    return null;
  }
});

/** Tizimga kirmagan tashrif buyuruvchi: bazada hisob yo'q, hech qanday yozish huquqi yo'q (can() doim false). */
export const GUEST_USER: SessionUser = {
  id: "guest",
  username: "guest",
  fullName: "Mehmon",
  role: "GUEST",
  avatarUrl: null,
  email: null,
  phone: null,
  mustChangePassword: false,
  lastLoginAt: null,
};
