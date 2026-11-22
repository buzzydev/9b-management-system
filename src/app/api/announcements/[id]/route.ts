import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { attachmentList, priorityEnum, requiredText } from "@/lib/validators";

const patchSchema = z
  .object({
    title: requiredText(200),
    body: requiredText(10000),
    priority: priorityEnum,
    pinned: z.boolean(),
    publishAt: z
      .string()
      .refine((s) => !Number.isNaN(new Date(s).getTime()), "Sana noto'g'ri")
      .transform((s) => new Date(s)),
    attachments: attachmentList,
  })
  .partial();

export const GET = route({ cap: "class.manage" }, async ({ params, session }) => {
  const a = await prisma.announcement.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { id: true, fullName: true } },
      reads: { where: { userId: session.id }, select: { userId: true } },
      _count: { select: { reads: true } },
    },
  });

  if (!a) {
    throw new HttpError(404, "E'lon topilmadi");
  }

  return {
    announcement: {
      ...a,
      read: a.reads.length > 0,
      readCount: a._count.reads,
      scheduled: a.publishAt > new Date(),
    },
  };
});

export const PATCH = route(
  { cap: "class.manage", body: patchSchema },
  async ({ params, body, log }) => {
    const existing = await prisma.announcement.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) {
      throw new HttpError(404, "E'lon topilmadi");
    }

    const a = await prisma.$transaction(async (tx) => {
      const updated = await tx.announcement.update({
        where: { id: params.id },
        data: {
          ...body,
          attachments: body.attachments === undefined ? undefined : body.attachments,
        },
      });
      await log(
        {
          action: "ANNOUNCEMENT_UPDATE",
          category: "announcement",
          description: `E'lonni tahrirladi: ${updated.title}`,
          entityType: "Announcement",
          entityId: updated.id,
        },
        tx
      );
      return updated;
    });

    return { announcement: a };
  }
);

export const DELETE = route({ cap: "class.manage" }, async ({ params, log }) => {
  const existing = await prisma.announcement.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!existing) {
    throw new HttpError(404, "E'lon topilmadi");
  }

  await prisma.$transaction(async (tx) => {
    const a = await tx.announcement.delete({ where: { id: params.id } });
    await log(
      {
        action: "ANNOUNCEMENT_DELETE",
        category: "announcement",
        description: `E'lonni o'chirdi: ${a.title}`,
        entityType: "Announcement",
        entityId: a.id,
      },
      tx
    );
  });

  return { ok: true };
});