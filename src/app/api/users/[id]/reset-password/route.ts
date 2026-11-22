import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { hashPassword, validatePasswordStrength } from "@/lib/auth";
import { generatePassword } from "@/lib/services/users";

const schema = z.object({ password: z.string().max(128).optional() });

// Parolni tiklash: berilgan parol yoki tasodifiy 12 belgili parol (faqat shu javobda qaytariladi).
export const POST = route(
  { cap: "users.manage", body: schema, rate: { name: "pwd-reset", limit: 20, windowMs: 10 * 60_000 } },
  async ({ session, params, body, log }) => {
    const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, username: true, fullName: true } });
    if (!user) throw new HttpError(404, "Foydalanuvchi topilmadi");
    if (user.id === session.id) throw new HttpError(400, "O'z parolingizni Sozlamalar → Xavfsizlik bo'limida almashtiring");

    const generated = !body.password;
    const password = body.password || generatePassword(12);
    if (!generated) {
      const weak = validatePasswordStrength(password);
      if (weak) throw new HttpError(400, weak);
    }
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          passwordChangedAt: new Date(), // barcha eski sessiyalar bekor bo'ladi
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      await log(
        { action: "PASSWORD_RESET", category: "user", description: `Parol tiklandi: ${user.fullName} (${user.username})${generated ? " — tasodifiy parol" : ""}`, entityType: "User", entityId: user.id },
        tx,
      );
    });
    return generated ? { ok: true, password } : { ok: true };
  },
);
