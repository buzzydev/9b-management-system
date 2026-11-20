import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";

// Kirish tarixi: oxirgi 50 ta LOGIN / LOGOUT / LOGIN_FAILED
export const GET = route({ cap: "users.manage" }, async ({ params }) => {
  const id = params.id;
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new HttpError(404, "Foydalanuvchi topilmadi");
  const items = await prisma.activityLog.findMany({
    where: {
      action: { in: ["LOGIN", "LOGOUT", "LOGIN_FAILED"] },
      OR: [{ userId: id }, { entityType: "User", entityId: id }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, description: true, ip: true, userAgent: true, createdAt: true },
  });
  return { items };
});
