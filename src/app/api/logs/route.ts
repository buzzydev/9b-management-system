import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, paging } from "@/lib/api";
import { can, CLASS_LOG_CATEGORIES } from "@/lib/permissions";
import { dayString } from "@/lib/validators";
import { dayStartUtc } from "@/lib/services/tz";
import { addDaysStr } from "@/lib/dates";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(40).optional(),
  userId: z.string().max(64).optional(),
  action: z.string().max(60).optional(),
  from: dayString.optional(),
  to: dayString.optional(),
});

// Faqat o'qish: UPDATE/DELETE yo'q (jurnal append-only, bazada trigger ham bloklaydi).
// Admin hammasini ko'radi; boshqa rollar faqat sinf boshqaruvi kategoriyalarini.
export const GET = route({ cap: "class.manage" }, async ({ session, query }) => {
  const f = querySchema.parse(Object.fromEntries(query.entries()));
  const { page, pageSize, skip, take } = paging(query, 25, 100);
  const isAdmin = can(session.role, "logs.all");
  const allowed: string[] = isAdmin ? [] : [...CLASS_LOG_CATEGORIES];

  const and: Prisma.ActivityLogWhereInput[] = [];
  if (!isAdmin) and.push({ category: { in: allowed } });
  if (f.category) and.push({ category: f.category });
  if (f.userId) and.push({ userId: f.userId });
  if (f.action) and.push({ action: f.action });
  if (f.q) {
    const ci = { contains: f.q, mode: "insensitive" as const };
    and.push({ OR: [{ description: ci }, { userName: ci }, { action: ci }, { entityId: ci }] });
  }
  if (f.from || f.to) {
    and.push({
      createdAt: {
        gte: f.from ? dayStartUtc(f.from) : undefined,
        lt: f.to ? dayStartUtc(addDaysStr(f.to, 1)) : undefined,
      },
    });
  }
  const where: Prisma.ActivityLogWhereInput = and.length ? { AND: and } : {};

  const base: Prisma.ActivityLogWhereInput = isAdmin ? {} : { category: { in: allowed } };
  const [items, total, cats, users] = await Promise.all([
    prisma.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.activityLog.count({ where }),
    prisma.activityLog.groupBy({ by: ["category"], where: base, orderBy: { category: "asc" } }),
    prisma.activityLog.groupBy({ by: ["userId", "userName"], where: { ...base, userId: { not: null } }, orderBy: { userName: "asc" }, take: 100 }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    facets: {
      categories: cats.map((c) => c.category),
      users: users.map((u) => ({ id: u.userId as string, name: u.userName })),
    },
  };
});
