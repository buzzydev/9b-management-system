import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { photoUrl, requiredText } from "@/lib/validators";
import { emailField, phoneField, emptyToNull } from "@/lib/services/users";

const schema = z
  .object({ fullName: requiredText(100), email: emailField, phone: phoneField, avatarUrl: photoUrl })
  .partial();

// Foydalanuvchi faqat O'Z profilini o'zgartiradi (rol/faollik bu yerdan o'zgarmaydi)
export const PATCH = route({ body: schema }, async ({ session, body, log }) => {
  const data = {
    ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
    ...(body.email !== undefined ? { email: emptyToNull(body.email) } : {}),
    ...(body.phone !== undefined ? { phone: emptyToNull(body.phone) } : {}),
    ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
  };
  const u = await prisma.user.update({ where: { id: session.id }, data });
  await log({ action: "PROFILE_UPDATE", category: "settings", description: "Profil ma'lumotlarini yangiladi", entityType: "User", entityId: session.id });
  return { user: { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, avatarUrl: u.avatarUrl } };
});
