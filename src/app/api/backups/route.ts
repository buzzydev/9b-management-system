import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { backupSelect, createBackup } from "@/lib/services/backup";

export const GET = route({ cap: "backup.manage" }, async () => {
  // `data` baytlari ro'yxatga kiritilmaydi
  const items = await prisma.backupRecord.findMany({ select: backupSelect, orderBy: { createdAt: "desc" }, take: 100 });
  return { items };
});

export const POST = route({ cap: "backup.manage", rate: { name: "backup-create", limit: 5, windowMs: 10 * 60_000 } }, async ({ session, log }) => {
  const rec = await createBackup(session.id);
  await log({ action: "BACKUP_CREATE", category: "backup", description: `Zaxira nusxa yaratildi: ${rec.filename} (${rec.recordCount} yozuv)`, entityType: "BackupRecord", entityId: rec.id });
  return { backup: rec };
});
