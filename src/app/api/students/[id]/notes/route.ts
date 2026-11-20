import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { notFound } from "@/lib/http-error";

export const GET = route({ cap: "class.manage" }, async ({ params }) => {
  const notes = await prisma.teacherNote.findMany({
    where: { studentId: params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { author: { select: { fullName: true } } },
  });
  return { items: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, author: n.author?.fullName ?? "—" })) };
});

export const POST = route({ cap: "class.manage", body: z.object({ body: z.string().trim().min(1, "Izoh bo'sh bo'lmasligi kerak").max(2000) }) }, async ({ params, session, body, log }) => {
  const s = await prisma.student.findUnique({ where: { id: params.id }, select: { id: true, fullName: true } });
  if (!s) throw notFound("O'quvchi topilmadi");
  const note = await prisma.$transaction(async (tx) => {
    const n = await tx.teacherNote.create({ data: { studentId: s.id, authorId: session.id, body: body.body } });
    await log({ action: "STUDENT_NOTE", category: "student", description: `${s.fullName} uchun izoh qo'shildi`, entityType: "Student", entityId: s.id }, tx);
    return n;
  });
  return { note: { id: note.id, body: note.body, createdAt: note.createdAt, author: session.fullName } };
});
