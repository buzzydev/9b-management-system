import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { createSession, hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth";

// Parolni o'zgartirish: eski parol shart; muvaffaqiyatdan keyin boshqa barcha sessiyalar bekor bo'ladi
export const POST = route(
  {
    body: z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }),
    rate: { name: "pwd-change", limit: 5, windowMs: 15 * 60_000 },
  },
  async ({ session, body, log }) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw new HttpError(400, "Joriy parol noto'g'ri");
    const weak = validatePasswordStrength(body.newPassword);
    if (weak) throw new HttpError(400, weak);
    if (body.newPassword === body.currentPassword) throw new HttpError(400, "Yangi parol eskisidan farq qilishi kerak");
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword), passwordChangedAt: new Date(), mustChangePassword: false },
    });
    await createSession(updated); // joriy qurilma tizimda qoladi
    await log({ action: "PASSWORD_CHANGED", category: "auth", description: "Parolini o'zgartirdi", entityType: "User", entityId: user.id });
    return { ok: true };
  },
);
