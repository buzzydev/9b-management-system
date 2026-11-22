import { prisma } from "@/lib/db";
import { route, notFoundIfEmpty } from "@/lib/api";

export const PATCH = route({}, async ({ session, params }) => {
  const r = await prisma.notification.updateMany({ where: { id: params.id, userId: session.id, readAt: null }, data: { readAt: new Date() } });
  void r;
  return { ok: true };
});

export const DELETE = route({}, async ({ session, params }) => {
  const r = await prisma.notification.deleteMany({ where: { id: params.id, userId: session.id } });
  notFoundIfEmpty(r.count);
  return { ok: true };
});
