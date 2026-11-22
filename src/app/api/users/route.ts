import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, paging, HttpError } from "@/lib/api";
import { hashPassword, validatePasswordStrength } from "@/lib/auth";
import { usernameSchema, roleEnum, requiredText } from "@/lib/validators";
import { ROLE_LABELS } from "@/lib/permissions";
import { emailField, phoneField, emptyToNull, userSelect } from "@/lib/services/users";

export const GET = route({ cap: "users.manage" }, async ({ query }) => {
  const { page, pageSize, skip, take } = paging(query, 20, 100);
  const where: Prisma.UserWhereInput = {};
  const q = query.get("q")?.trim();
  if (q) {
    where.OR = [
      { username: { contains: q, mode: "insensitive" } },
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  const role = roleEnum.safeParse(query.get("role"));
  if (role.success) where.role = role.data;
  const active = query.get("isActive");
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;

  const [items, total, active_count] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, orderBy: [{ isActive: "desc" }, { fullName: "asc" }, { id: "asc" }], skip, take }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { isActive: true } }),
  ]);
  return { items, total, page, pageSize, totals: { active: active_count } };
});

const createSchema = z.object({
  username: usernameSchema,
  fullName: requiredText(120),
  role: roleEnum,
  email: emailField,
  phone: phoneField,
  password: z.string().min(1, "Parolni kiriting").max(128),
  mustChangePassword: z.boolean().default(true),
});

export const POST = route({ cap: "users.manage", body: createSchema }, async ({ body, log }) => {
  const weak = validatePasswordStrength(body.password);
  if (weak) throw new HttpError(400, weak);
  if (await prisma.user.findUnique({ where: { username: body.username }, select: { id: true } })) {
    throw new HttpError(409, `“${body.username}” foydalanuvchi nomi band`);
  }
  const passwordHash = await hashPassword(body.password);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        username: body.username,
        fullName: body.fullName,
        role: body.role,
        email: emptyToNull(body.email) ?? null,
        phone: emptyToNull(body.phone) ?? null,
        passwordHash,
        mustChangePassword: body.mustChangePassword,
        settings: { create: {} },
      },
      select: userSelect,
    });
    await log(
      { action: "USER_CREATE", category: "user", description: `Foydalanuvchi yaratildi: ${u.fullName} (${u.username}, ${ROLE_LABELS[u.role]})`, entityType: "User", entityId: u.id },
      tx,
    );
    return u;
  });
  return { user };
});
