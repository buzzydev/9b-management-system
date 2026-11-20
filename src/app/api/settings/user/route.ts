import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";

const schema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
    language: z.enum(["uz", "en", "ru"]),
    notifyAttendance: z.boolean(),
    notifyHomework: z.boolean(),
    notifyAnnouncements: z.boolean(),
    notifyGrades: z.boolean(),
    notifyTimetable: z.boolean(),
    notifyEvents: z.boolean(),
    notifyMessages: z.boolean(),
    hiddenWidgets: z.array(z.string().max(40)).max(30),
  })
  .partial()
  .strict();

// Shaxsiy sozlamalar (mavzu, til, bildirishnomalar, dashboard vidjetlari)
export const PATCH = route({ body: schema }, async ({ session, body }) => {
  const s = await prisma.userSettings.upsert({
    where: { userId: session.id },
    update: body,
    create: { userId: session.id, ...body },
  });
  return { settings: s };
});
