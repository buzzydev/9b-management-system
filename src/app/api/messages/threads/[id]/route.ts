import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { notifyUsers } from "@/lib/notify";

const PAGE = 50;

const sendSchema = z.object({
  body: z.string().trim().min(1, "Xabar bo'sh bo'lmasligi kerak").max(2000, "Xabar 2000 belgidan oshmasligi kerak"),
});

async function requireMember(threadId: string, userId: string) {
  const m = await prisma.threadMember.findUnique({ where: { threadId_userId: { threadId, userId } } });
  if (!m) throw new HttpError(404, "Suhbat topilmadi"); // a'zo bo'lmaganga mavjudligi ham bildirilmaydi
}

export const GET = route({}, async ({ session, params, query }) => {
  await requireMember(params.id, session.id);
  const beforeRaw = query.get("before");
  let before: Date | undefined;
  if (beforeRaw) {
    before = new Date(beforeRaw);
    if (Number.isNaN(before.getTime())) throw new HttpError(400, "before noto'g'ri sana");
  }

  const [thread, rows] = await Promise.all([
    prisma.thread.findUnique({ where: { id: params.id }, include: { members: { include: { user: { select: { id: true, fullName: true, avatarUrl: true, role: true } } } } } }),
    prisma.message.findMany({
      where: { threadId: params.id, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: "desc" },
      take: PAGE + 1,
      include: { sender: { select: { id: true, fullName: true } } },
    }),
  ]);
  if (!thread) throw new HttpError(404, "Suhbat topilmadi");

  if (!before) {
    await prisma.threadMember.update({ where: { threadId_userId: { threadId: params.id, userId: session.id } }, data: { lastReadAt: new Date() } });
  }

  const hasMore = rows.length > PAGE;
  const messages = rows.slice(0, PAGE).reverse();
  const other = thread.members.find((m) => m.userId !== session.id)?.user;
  return {
    thread: { id: thread.id, title: thread.isGroup ? (thread.title ?? "Guruh") : (other?.fullName ?? "Foydalanuvchi"), isGroup: thread.isGroup },
    members: thread.members.map((m) => ({
      id: m.user.id,
      fullName: m.user.fullName,
      avatarUrl: m.user.avatarUrl,
      role: m.user.role,
      lastReadAt: m.userId === session.id ? new Date() : m.lastReadAt,
    })),
    messages: messages.map((m) => ({ id: m.id, senderId: m.senderId, senderName: m.sender?.fullName ?? null, body: m.body, createdAt: m.createdAt })),
    hasMore,
  };
});

export const POST = route({ body: sendSchema }, async ({ session, params, body }) => {
  await requireMember(params.id, session.id);
  const { message, others } = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({ data: { threadId: params.id, senderId: session.id, body: body.body } });
    await tx.thread.update({ where: { id: params.id }, data: { updatedAt: msg.createdAt } });
    await tx.threadMember.update({ where: { threadId_userId: { threadId: params.id, userId: session.id } }, data: { lastReadAt: msg.createdAt } });
    const members = await tx.threadMember.findMany({ where: { threadId: params.id, userId: { not: session.id } }, select: { userId: true } });
    return { message: msg, others: members.map((m) => m.userId) };
  });
  if (others.length) {
    await notifyUsers({
      type: "MESSAGE",
      title: `Yangi xabar: ${session.fullName}`,
      body: body.body.slice(0, 200),
      link: `/messages?thread=${params.id}`,
      userIds: others,
      dedupeKey: `msg:${message.id}`,
    }).catch(() => {});
  }
  return { message: { id: message.id, senderId: message.senderId, senderName: session.fullName, body: message.body, createdAt: message.createdAt } };
});
