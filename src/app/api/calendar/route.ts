import { z } from "zod";
import { prisma, getClass } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { eventTypeEnum, optionalText, requiredText } from "@/lib/validators";

const dateTime = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Sana/vaqt noto'g'ri")
  .transform((s) => new Date(s));

const eventBase = z.object({
  title: requiredText(200),
  description: optionalText(2000),
  type: eventTypeEnum,
  startsAt: dateTime,
  endsAt: z.union([dateTime, z.null()]).optional(),
  allDay: z.boolean().optional().default(false),
  reminderMinutes: z.union([z.number().int().min(0).max(10080), z.null()]).optional(),
});

const createSchema = eventBase.refine((v) => !v.endsAt || v.endsAt >= v.startsAt, {
  message: "Tugash vaqti boshlanishdan oldin bo'lishi mumkin emas",
  path: ["endsAt"],
});

function parseRange(q: URLSearchParams) {
  const from = new Date(q.get("from") ?? "");
  const to = new Date(q.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new HttpError(400, "from va to (ISO sana) talab qilinadi");
  if (to.getTime() - from.getTime() > 120 * 86400000) throw new HttpError(400, "Oraliq juda katta");
  return { from, to };
}

export const GET = route({ cap: "class.manage", guest: true }, async ({ query }) => {
  const { from, to } = parseRange(query);
  const events = await prisma.calendarEvent.findMany({
    where: { startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: "asc" },
    take: 1000,
  });
  return { items: events.map((e) => ({ ...e, virtual: false, source: "event" })) };
});

export const POST = route({ cap: "class.manage", body: createSchema }, async ({ body, session, log }) => {
  const cls = await getClass();
  const ev = await prisma.$transaction(async (tx) => {
    const created = await tx.calendarEvent.create({
      data: {
        classId: cls.id,
        title: body.title,
        description: body.description,
        type: body.type,
        startsAt: body.startsAt,
        endsAt: body.endsAt ?? null,
        allDay: body.allDay,
        reminderMinutes: body.reminderMinutes ?? null,
        createdById: session.id,
      },
    });
    await log({ action: "EVENT_CREATE", category: "calendar", description: `Tadbir yaratdi: ${created.title}`, entityType: "CalendarEvent", entityId: created.id }, tx);
    return created;
  });
  return { event: ev };
});
