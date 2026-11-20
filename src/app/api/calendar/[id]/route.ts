import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { eventTypeEnum, optionalText, requiredText } from "@/lib/validators";

const dateTime = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Sana/vaqt noto'g'ri")
  .transform((s) => new Date(s));

const patchSchema = z
  .object({
    title: requiredText(200),
    description: optionalText(2000),
    type: eventTypeEnum,
    startsAt: dateTime,
    endsAt: z.union([dateTime, z.null()]),
    allDay: z.boolean(),
    reminderMinutes: z.union([z.number().int().min(0).max(10080), z.null()]),
  })
  .partial();

function guard(id: string) {
  if (id.startsWith("hw:")) throw new HttpError(400, "Uy vazifa muddatini Uy vazifalari bo'limida o'zgartiring");
}

export const PATCH = route({ cap: "class.manage", body: patchSchema }, async ({ params, body, log }) => {
  guard(params.id);
  const existing = await prisma.calendarEvent.findUnique({ where: { id: params.id } });
  if (!existing) throw new HttpError(404, "Tadbir topilmadi");
  const startsAt = body.startsAt ?? existing.startsAt;
  const endsAt = body.endsAt === undefined ? existing.endsAt : body.endsAt;
  if (endsAt && endsAt < startsAt) throw new HttpError(400, "Tugash vaqti boshlanishdan oldin bo'lishi mumkin emas");
  const ev = await prisma.$transaction(async (tx) => {
    const updated = await tx.calendarEvent.update({ where: { id: params.id }, data: body });
    await log({ action: "EVENT_UPDATE", category: "calendar", description: `Tadbirni tahrirladi: ${updated.title}`, entityType: "CalendarEvent", entityId: updated.id }, tx);
    return updated;
  });
  return { event: ev };
});

export const DELETE = route({ cap: "class.manage" }, async ({ params, log }) => {
  guard(params.id);
  await prisma.$transaction(async (tx) => {
    const ev = await tx.calendarEvent.delete({ where: { id: params.id } });
    await log({ action: "EVENT_DELETE", category: "calendar", description: `Tadbirni o'chirdi: ${ev.title}`, entityType: "CalendarEvent", entityId: ev.id }, tx);
  });
  return { ok: true };
});
