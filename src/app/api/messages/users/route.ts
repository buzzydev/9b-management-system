import { prisma } from "@/lib/db";
import { route } from "@/lib/api";

// Xabar yozish mumkin bo'lgan faol foydalanuvchilar (o'zimdan tashqari)
export const GET = route({}, async ({ session }) => {
  const users = await prisma.user.findMany({
    where: { isActive: true, id: { not: session.id } },
    select: { id: true, fullName: true, role: true, avatarUrl: true },
    orderBy: { fullName: "asc" },
    take: 500,
  });
  return { items: users };
});
