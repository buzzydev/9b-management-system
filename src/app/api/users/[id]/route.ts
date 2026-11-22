import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { roleEnum, requiredText } from "@/lib/validators";
import { ROLE_LABELS } from "@/lib/permissions";
import { emailField, phoneField, emptyToNull, userSelect, lockActiveAdmins, assertNotLastAdmin } from "@/lib/services/users";

export const GET = route({ cap: "users.manage" }, async ({ params }) => {
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: userSelect });
  if (!user) throw new HttpError(404, "Foydalanuvchi topilmadi");
  return { user };
});

const patchSchema = z
  .object({
    fullName: requiredText(120),
    role: roleEnum,
    email: emailField,
    phone: phoneField,
    isActive: z.boolean(),
  })
  .partial();

export const PATCH = route({ cap: "users.manage", body: patchSchema }, async ({ session, params, body, log }) => {
  const id = params.id;
  const self = id === session.id;
  if (self && body.isActive === false) throw new HttpError(400, "O'zingizni nofaol qila olmaysiz");
  if (self && body.role !== undefined && body.role !== session.role) throw new HttpError(400, "O'zingizning rolingizni o'zgartira olmaysiz");

  const result = await prisma.$transaction(async (tx) => {
    const adminIds = await lockActiveAdmins(tx);
    const before = await tx.user.findUnique({ where: { id }, select: userSelect });
    if (!before) throw new HttpError(404, "Foydalanuvchi topilmadi");

    const newRole = body.role ?? before.role;
    const newActive = body.isActive ?? before.isActive;
    if (before.role === "ADMIN" && before.isActive && (newRole !== "ADMIN" || !newActive)) {
      assertNotLastAdmin(adminIds, id, "Oxirgi faol administratorni o'zgartirib bo'lmaydi");
    }

    const user = await tx.user.update({
      where: { id },
      data: {
        ...(body.fullName !== undefined && { fullName: body.fullName }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.email !== undefined && { email: emptyToNull(body.email) }),
        ...(body.phone !== undefined && { phone: emptyToNull(body.phone) }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      select: userSelect,
    });

    const changes: string[] = [];
    if (before.role !== user.role) changes.push(`rol: ${ROLE_LABELS[before.role]} → ${ROLE_LABELS[user.role]}`);
    if (before.isActive !== user.isActive) changes.push(`holat: ${before.isActive ? "faol" : "nofaol"} → ${user.isActive ? "faol" : "nofaol"}`);
    if (before.fullName !== user.fullName) changes.push(`ism: ${before.fullName} → ${user.fullName}`);
    if (before.email !== user.email) changes.push("email o'zgardi");
    if (before.phone !== user.phone) changes.push("telefon o'zgardi");
    if (changes.length) {
      const important = before.role !== user.role || before.isActive !== user.isActive;
      await log(
        {
          action: important ? (before.isActive !== user.isActive ? "USER_STATUS" : "USER_ROLE") : "USER_UPDATE",
          category: "user",
          description: `${user.fullName} (${user.username}) — ${changes.join("; ")}`,
          entityType: "User",
          entityId: id,
        },
        tx,
      );
    }
    return user;
  });
  return { user: result };
});

export const DELETE = route({ cap: "users.manage" }, async ({ session, params, log }) => {
  const id = params.id;
  if (id === session.id) throw new HttpError(400, "O'zingizni o'chira olmaysiz");
  await prisma.$transaction(async (tx) => {
    const adminIds = await lockActiveAdmins(tx);
    const u = await tx.user.findUnique({ where: { id }, select: userSelect });
    if (!u) throw new HttpError(404, "Foydalanuvchi topilmadi");
    assertNotLastAdmin(adminIds, id, "Oxirgi faol administratorni o'chirib bo'lmaydi");
    await tx.user.delete({ where: { id } });
    await log({ action: "USER_DELETE", category: "user", description: `Foydalanuvchi o'chirildi: ${u.fullName} (${u.username}, ${ROLE_LABELS[u.role]})`, entityType: "User", entityId: id }, tx);
  });
  return { ok: true };
});
