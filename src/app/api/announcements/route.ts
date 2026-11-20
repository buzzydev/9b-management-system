import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, paging } from "@/lib/api";
import { attachmentList, priorityEnum, requiredText } from "@/lib/validators";
import { notifyUsers } from "@/lib/notify";
import type { Prisma } from "@prisma/client";

const publishAt = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Sana noto'g'ri")
  .transform((s) => new Date(s));

const announcementSchema = z.object({
  title: requiredText(200),
  body: requiredText(10000),
  priority: priorityEnum.default("NORMAL"),
  pinned: z.boolean().default(false),
  publishAt: publishAt.optional(),
  attachments: attachmentList,
});

export const GET = route({ cap: "class.manage", guest: true }, async ({ session, query }) => {
  const guest = session.role === "GUEST";
  const { page, pageSize, skip, take } = paging(query, 20, 50);
  const priority = query.get("priority");
  const unread = !guest && query.get("unread") === "1";
  const where: Prisma.AnnouncementWhereInput = {
    ...(priority && ["NORMAL", "IMPORTANT", "URGENT"].includes(priority) ? { priority: priority as "NORMAL" } : {}),
    ...(guest ? { publishAt: { lte: new Date() } } : {}),
    ...(unread ? { reads: { none: { userId: session.id } } } : {}),
  };
  const [rows, total, unreadTotal] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { publishAt: "desc" }],
      skip,
      take,
      include: {
        author: { select: { id: true, fullName: true } },
        reads: { where: { userId: session.id }, select: { userId: true } },
        _count: { select: { reads: true } },
      },
    }),
    prisma.announcement.count({ where }),
    prisma.announcement.count({ where: { reads: { none: { userId: session.id } } } }),
  ]);
  const now = Date.now();
  // Mehmon: rejalashtirilgan (hali chop etilmagan) e'lonlar, fayllar va o'qish statistikasi ko'rsatilmaydi
  const visible = guest ? rows.filter((a) => a.publishAt.getTime() <= now) : rows;
  return {
    items: visible.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      priority: a.priority,
      pinned: a.pinned,
      publishAt: a.publishAt,
      attachments: guest ? [] : a.attachments ?? [],
      author: a.author,
      read: guest ? true : a.reads.length > 0,
      readCount: guest ? 0 : a._count.reads,
      scheduled: a.publishAt.getTime() > now,
      createdAt: a.createdAt,
    })),
    total,
    unread: guest ? 0 : unreadTotal,
    page,
    pageSize,
  };
});

export const POST = route({ cap: "class.manage", body: announcementSchema }, async ({ session, body, log }) => {
  const when = body.publishAt ?? new Date();
  const a = await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: {
        title: body.title,
        body: body.body,
        priority: body.priority,
        pinned: body.pinned,
        publishAt: when,
        attachments: body.attachments ?? undefined,
        authorId: session.id,
      },
    });
    // Muallif o'z e'lonini o'qilgan deb hisoblaydi
    await tx.announcementRead.create({ data: { announcementId: created.id, userId: session.id } });
    await log({ action: "ANNOUNCEMENT_CREATE", category: "announcement", description: `E'lon chop etdi: ${created.title}`, entityType: "Announcement", entityId: created.id }, tx);
    return created;
  });
  if (when.getTime() <= Date.now()) {
    await notifyUsers({ type: "NEW_ANNOUNCEMENT", title: `Yangi e'lon: ${a.title}`, link: "/announcements", dedupeKey: `ann:${a.id}`, excludeUserId: session.id }).catch(() => {});
  }
  return { announcement: a };
});
