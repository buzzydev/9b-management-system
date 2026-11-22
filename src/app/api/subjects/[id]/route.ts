import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { requiredText, optionalText } from "@/lib/validators";

const schema = z.object({ name: requiredText(80), shortName: optionalText(20) });

export const PATCH = route({ cap: "class.manage", body: schema }, async ({ body, params, log }) => {
  const s = await prisma.subject.update({ where: { id: params.id }, data: { name: body.name, shortName: body.shortName } });
  await log({ action: "SUBJECT_UPDATE", category: "subject", description: `Fan o'zgartirildi: ${s.name}`, entityType: "Subject", entityId: s.id });
  return { subject: s };
});

export const DELETE = route({ cap: "class.manage" }, async ({ params, log }) => {
  const s = await prisma.subject.findUnique({ where: { id: params.id } });
  if (!s) throw new HttpError(404, "Fan topilmadi");
  try {
    await prisma.subject.delete({ where: { id: params.id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") throw new HttpError(409, "Bu fan ishlatilmoqda (jadval, uy vazifa yoki baholarda). Avval bog'liq yozuvlarni o'chiring");
    throw e;
  }
  await log({ action: "SUBJECT_DELETE", category: "subject", description: `Fan o'chirildi: ${s.name}`, entityType: "Subject", entityId: s.id });
  return { ok: true };
});
