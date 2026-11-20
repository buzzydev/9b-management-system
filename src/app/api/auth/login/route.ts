import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { publicRoute, HttpError } from "@/lib/api";
import { logActivity } from "@/lib/audit";
import { enforceRate, resetRate } from "@/lib/rate-limit";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export const POST = publicRoute(
  {
    body: z.object({ username: z.string().trim().toLowerCase().min(1).max(64), password: z.string().min(1).max(200) }),
    // IP bo'yicha: 15 daqiqada 30 urinish
    rate: { name: "login-ip", limit: 30, windowMs: 15 * 60_000 },
  },
  async ({ body, ip, req }) => {
    // Foydalanuvchi nomi bo'yicha ham cheklov (taqsimlangan hujumlarga qarshi)
    enforceRate(`login-user:${body.username}`, 15, 15 * 60_000);
    const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;
    const generic = new HttpError(401, "Foydalanuvchi nomi yoki parol noto'g'ri");

    const user = await prisma.user.findUnique({ where: { username: body.username } });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      await logActivity({ userName: user.fullName, user: null, action: "LOGIN_BLOCKED", category: "auth", description: `Bloklangan hisobga kirish urinishi (${user.username})`, entityType: "User", entityId: user.id, ip, userAgent: ua });
      throw new HttpError(423, `Hisob vaqtincha bloklangan. ${mins} daqiqadan keyin urinib ko'ring`);
    }

    const ok = await verifyPassword(body.password, user?.passwordHash);
    if (!user || !ok || !user.isActive) {
      if (user) {
        const fails = user.failedLogins + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: fails },
        });
      }
      await logActivity({
        userName: user?.fullName ?? body.username,
        user: null,
        action: "LOGIN_FAILED",
        category: "auth",
        description: user && !user.isActive && ok ? `Nofaol hisob bilan kirish urinishi (${body.username})` : `Muvaffaqiyatsiz kirish: ${body.username}`,
        entityType: user ? "User" : undefined,
        entityId: user?.id,
        ip,
        userAgent: ua,
      });
      throw generic;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    resetRate(`login-user:${body.username}`);
    await createSession(updated);
    await logActivity({ user: updated, action: "LOGIN", category: "auth", description: "Tizimga kirdi", entityType: "User", entityId: updated.id, ip, userAgent: ua });
    return { ok: true, mustChangePassword: updated.mustChangePassword };
  },
);
