import { route } from "@/lib/api";
import { createBackup, getBackupOverview } from "@/lib/services/backup";

export const dynamic = "force-dynamic";

// Zaxiralar tarixi + holat (sozlanganmi, ulanish, keyingi reja). Zaxira baytlari ro'yxatga kirmaydi.
export const GET = route({ cap: "backup.manage" }, async () => getBackupOverview());

export const POST = route({ cap: "backup.manage", rate: { name: "backup-create", limit: 5, windowMs: 10 * 60_000 } }, async ({ session, log }) => {
  const rec = await createBackup(session);
  await log({
    action: "BACKUP_CREATE",
    category: "backup",
    description: `Zaxira nusxa yaratildi va tekshirildi: ${rec.filename} (${rec.recordCount} yozuv, ${rec.destination === "BACKUP_DB" ? "alohida zaxira bazasi" : "asosiy baza — himoyasiz"})`,
    entityType: "Backup",
    entityId: rec.id,
  });
  return { backup: rec };
});
