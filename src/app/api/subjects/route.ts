import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { requiredText, optionalText } from "@/lib/validators";

const schema = z.object({ name: requiredText(80), shortName: optionalText(20) });

export const GET = route({ cap: "class.manage", guest: true }, async () => {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { timetable: true, homework: true, grades: true } } },
  });
  return {
    items: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      shortName: s.shortName,
      usage: s._count.timetable + s._count.homework + s._count.grades,
      counts: s._count,
    })),
  };
});

export const POST = route({ cap: "class.manage", body: schema }, async ({ body, log }) => {
  const s = await prisma.subject.create({ data: { name: body.name, shortName: body.shortName } });
  await log({ action: "SUBJECT_CREATE", category: "subject", description: `Fan qo'shildi: ${s.name}`, entityType: "Subject", entityId: s.id });
  return { subject: s };
});
