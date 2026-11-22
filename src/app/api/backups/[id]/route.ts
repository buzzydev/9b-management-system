import { z } from "zod";
import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { deleteBackup, loadBackupBytes, restoreBackup } from "@/lib/services/backup";

export const dynamic = "force-dynamic";

// Yuklab olish — faqat admin; yuklashdan oldin nazorat summasi tekshiriladi
export const GET = route({ cap: "backup.manage", rate: { name: "backup-dl", limit: 10, windowMs: 10 * 60_000 } }, async ({ params, log }) => {
  const { bytes, filename, checksum } = await loadBackupBytes(params.id);
  await log({ action: "BACKUP_DOWNLOAD", category: "backup", description: `Zaxira yuklab olindi: ${filename}`, entityType: "Backup", entityId: params.id });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]/g, "_")}"`,
      "Content-Length": String(bytes.length),
      "X-Checksum-SHA256": checksum ?? "",
      "Cache-Control": "no-store",
    },
  });
});

export const POST = route(
  { cap: "backup.manage", body: z.object({ confirm: z.literal("RESTORE") }), rate: { name: "backup-restore", limit: 3, windowMs: 10 * 60_000 } },
  async ({ params, session, ip }) => restoreBackup(params.id, session, ip),
);

export const DELETE = route({ cap: "backup.manage", rate: { name: "backup-del", limit: 10, windowMs: 10 * 60_000 } }, async ({ params, log }) => {
  const rec = await deleteBackup(params.id);
  await log({ action: "BACKUP_DELETE", category: "backup", description: `Zaxira o'chirildi: ${rec.filename}`, entityType: "Backup", entityId: params.id });
  return { ok: true };
});
