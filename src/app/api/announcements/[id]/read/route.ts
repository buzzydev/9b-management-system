import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";

export const POST = route({ cap: "class.manage" }, async ({ params, session }) => {
  const exists = await prisma.announcement.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) throw new HttpError(404, "E'lon topilmadi");
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: params.id, userId: session.id } },
    update: {},
    create: { announcementId: params.id, userId: session.id },
  });
  return { ok: true };
});

export const GET = route({ cap: "class.manage" }, async ({ params }) => {
  const reads = await prisma.announcementRead.findMany({
    where: { announcementId: params.id },
    orderBy: { readAt: "desc" },
    include: { user: { select: { id: true, fullName: true, role: true } } },
    take: 200,
  });
  return { items: reads.map((r) => ({ userId: r.user.id, fullName: r.user.fullName, role: r.user.role, readAt: r.readAt })) };
});
