import fs from "node:fs/promises";
import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { loadBackupBytes, restoreBackup } from "@/lib/services/backup";

// Yuklab olish — faqat admin; maxfiy ulanish ma'lumotlari zaxiraga kirmaydi
export const GET = route({ cap: "backup.manage", rate: { name: "backup-dl", limit: 10, windowMs: 10 * 60_000 } }, async ({ params, log }) => {
  const { bytes, filename, checksum } = await loadBackupBytes(params.id);
  await log({ action: "BACKUP_DOWNLOAD", category: "backup", description: `Zaxira yuklab olindi: ${filename}`, entityType: "BackupRecord", entityId: params.id });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename}"`,
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

export const DELETE = route({ cap: "backup.manage" }, async ({ params, log }) => {
  const rec = await prisma.backupRecord.findUnique({ where: { id: params.id }, select: { id: true, filename: true, storagePath: true } });
  if (!rec) throw new HttpError(404, "Zaxira topilmadi");
  await prisma.backupRecord.delete({ where: { id: rec.id } });
  if (rec.storagePath && rec.storagePath !== "db") await fs.unlink(rec.storagePath).catch(() => {});
  await log({ action: "BACKUP_DELETE", category: "backup", description: `Zaxira o'chirildi: ${rec.filename}`, entityType: "BackupRecord", entityId: rec.id });
  return { ok: true };
});
