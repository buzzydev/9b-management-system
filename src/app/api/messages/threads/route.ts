import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { id } from "@/lib/validators";
import { notifyUsers } from "@/lib/notify";

const createSchema = z.object({
  userIds: z.array(id).min(1, "Kamida bitta qabul qiluvchi tanlang").max(50),
  title: z
    .union([z.string().trim().max(100), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  body: z.string().trim().min(1, "Xabar bo'sh bo'lmasligi kerak").max(2000, "Xabar 2000 belgidan oshmasligi kerak"),
});

const userSel = { id: true, fullName: true, avatarUrl: true, role: true } as const;

export const GET = route({}, async ({ session }) => {
  const [threads, unreadRows] = await Promise.all([
    prisma.thread.findMany({
      where: { members: { some: { userId: session.id } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        members: { include: { user: { select: userSel } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, fullName: true } } } },
      },
    }),
    prisma.$queryRaw<{ threadId: string; n: number }[]>`
      SELECT m."threadId" AS "threadId", COUNT(m.id)::int AS n
      FROM "ThreadMember" tm
      JOIN "Message" m ON m."threadId" = tm."threadId"
        AND m."createdAt" > COALESCE(tm."lastReadAt", tm."joinedAt")
        AND m."senderId" IS DISTINCT FROM tm."userId"
      WHERE tm."userId" = ${session.id}
      GROUP BY m."threadId"`,
  ]);
  const unread = new Map(unreadRows.map((r) => [r.threadId, Number(r.n)]));
  return {
    items: threads.map((t) => {
      const members = t.members.map((m) => m.user);
      const other = members.find((u) => u.id !== session.id);
      const last = t.messages[0];
      return {
        id: t.id,
        title: t.isGroup ? (t.title ?? "Guruh") : (other?.fullName ?? "Foydalanuvchi"),
        isGroup: t.isGroup,
        members,
        avatarUrl: t.isGroup ? null : (other?.avatarUrl ?? null),
        lastMessage: last ? { id: last.id, body: last.body, senderId: last.senderId, senderName: last.sender?.fullName ?? null, createdAt: last.createdAt } : null,
        unread: unread.get(t.id) ?? 0,
        updatedAt: t.updatedAt,
      };
    }),
  };
});

export const POST = route({ body: createSchema }, async ({ session, body, log }) => {
  const others = [...new Set(body.userIds)].filter((u) => u !== session.id);
  if (!others.length) throw new HttpError(400, "O'zingizga xabar yozib bo'lmaydi");
  const found = await prisma.user.findMany({ where: { id: { in: others }, isActive: true }, select: { id: true } });
  if (found.length !== others.length) throw new HttpError(400, "Tanlangan foydalanuvchilardan biri topilmadi yoki faol emas");

  const isGroup = others.length >= 2;
  const title = body.title;
  if (isGroup && !title) throw new HttpError(400, "Guruh nomini kiriting");
  const dmKey = isGroup ? null : [session.id, others[0]].sort().join(":");

  const run = () =>
    prisma.$transaction(async (tx) => {
      const now = new Date();
      let thread = dmKey ? await tx.thread.findUnique({ where: { dmKey } }) : null;
      let created = false;
      if (!thread) {
        thread = await tx.thread.create({
          data: {
            title: isGroup ? title : null,
            isGroup,
            dmKey,
            createdById: session.id,
            updatedAt: now,
            members: {
              create: [{ userId: session.id, lastReadAt: now }, ...others.map((userId) => ({ userId }))],
            },
          },
        });
        created = true;
      }
      const message = await tx.message.create({ data: { threadId: thread.id, senderId: session.id, body: body.body } });
      await tx.thread.update({ where: { id: thread.id }, data: { updatedAt: message.createdAt } });
      await tx.threadMember.update({ where: { threadId_userId: { threadId: thread.id, userId: session.id } }, data: { lastReadAt: message.createdAt } });
      if (created) {
        await log({ action: "THREAD_CREATE", category: "user", description: isGroup ? `Guruh suhbat yaratdi: ${title}` : "Shaxsiy suhbat boshladi", entityType: "Thread", entityId: thread.id }, tx);
      }
      return { thread, message };
    });

  let res;
  try {
    res = await run();
  } catch (e) {
    // Bir vaqtda bir xil DM yaratilsa (dmKey unikal) — qayta urinish mavjud suhbatni topadi
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && dmKey) res = await run();
    else throw e;
  }

  await notifyUsers({
    type: "MESSAGE",
    title: `Yangi xabar: ${session.fullName}`,
    body: body.body.slice(0, 200),
    link: `/messages?thread=${res.thread.id}`,
    userIds: others,
  }).catch(() => {});
  return { thread: { id: res.thread.id }, message: res.message };
});
