import { z } from "zod";
import { prisma, getClass } from "@/lib/db";
import { route } from "@/lib/api";

export const POST = route(
  { cap: "class.manage", body: z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200), action: z.enum(["archive", "restore"]) }) },
  async ({ body, log }) => {
    const cls = await getClass();
    const archive = body.action === "archive";
    const count = await prisma.$transaction(async (tx) => {
      const r = await tx.student.updateMany({
        where: { id: { in: body.ids }, classId: cls.id, status: archive ? "ACTIVE" : "ARCHIVED" },
        data: archive ? { status: "ARCHIVED", archivedAt: new Date() } : { status: "ACTIVE", archivedAt: null },
      });
      await log({ action: archive ? "STUDENT_BULK_ARCHIVE" : "STUDENT_BULK_RESTORE", category: "student", description: `${r.count} ta o'quvchi ${archive ? "arxivlandi" : "arxivdan qaytarildi"}`, entityType: "Student" }, tx);
      return r.count;
    });
    return { ok: true, updated: count };
  },
);
