/**
 * Railway Cron xizmati uchun kirish nuqtasi: `npm run backup:cron`
 * Har kuni 03:00 Asia/Tashkent = 22:00 UTC (oldingi kun) → cron: `0 22 * * *` (railway.backup.json).
 *
 * Ishi: bitta to'liq zaxira → alohida bazaga yozish → qayta o'qib tekshirish → eski zaxiralarni tozalash.
 * Xato bo'lsa 3 martagacha qayta uriniladi; oxirida ham bo'lmasa adminlarga bildirishnoma va chiqish kodi 1.
 */
import { prisma } from "@/lib/db";
import { backupConfigState, closeBackupPool, notifyAdminsBackupFailure, runBackup } from "@/lib/services/backup-core";
import { redact } from "@/lib/services/backup-policy";

const ATTEMPTS = 3;
const WAIT_MS = [0, 30_000, 120_000];
const log = (level: string, msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ level, scope: "backup-cron", msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<number> {
  const cfg = backupConfigState();
  if (!cfg.configured) {
    const m = "BACKUP_DATABASE_URL o'rnatilmagan — avtomatik zaxira ishlamadi";
    log("error", m);
    await notifyAdminsBackupFailure(m);
    return 1;
  }
  if (cfg.sameAsPrimary) {
    const m = "BACKUP_DATABASE_URL asosiy bazaga ishora qilmoqda — zaxira ALOHIDA bazada bo'lishi shart";
    log("error", m);
    await notifyAdminsBackupFailure(m);
    return 1;
  }

  let lastErr = "";
  for (let i = 0; i < ATTEMPTS; i++) {
    if (WAIT_MS[i]) {
      log("warn", `qayta urinish ${i + 1}/${ATTEMPTS}`, { waitMs: WAIT_MS[i] });
      await sleep(WAIT_MS[i]);
    }
    try {
      const res = await runBackup({ kind: "DAILY" });
      if (res.outcome === "skipped") {
        log("info", res.reason === "ALREADY_DONE" ? "bugungi zaxira allaqachon bor — o'tkazib yuborildi" : "boshqa jarayon zaxira yaratmoqda — o'tkazib yuborildi", { id: res.backup?.id });
        return 0;
      }
      const b = res.backup;
      log("info", "zaxira yaratildi va tekshirildi", { id: b.id, bytes: b.sizeBytes, records: b.recordCount, sha256: b.checksum, deletedExpired: res.deleted });
      try {
        await prisma.activityLog.create({
          data: { userName: "Tizim", action: "BACKUP_AUTO", category: "backup", description: `Kunlik avtomatik zaxira: ${b.filename} (${b.recordCount} yozuv, tekshirildi); eskirgan: ${res.deleted} ta o'chirildi`, entityType: "Backup", entityId: b.id },
        });
      } catch (e) {
        log("warn", "jurnalga yozib bo'lmadi", { err: redact(String(e)) });
      }
      return 0;
    } catch (e) {
      lastErr = redact(e instanceof Error ? e.message : String(e));
      log("error", "urinish muvaffaqiyatsiz", { attempt: i + 1, err: lastErr });
    }
  }
  await notifyAdminsBackupFailure(`Kunlik zaxira ${ATTEMPTS} urinishdan keyin ham yaratilmadi: ${lastErr}`);
  return 1;
}

main()
  .then(async (code) => {
    await closeBackupPool();
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(JSON.stringify({ level: "error", scope: "backup-cron", msg: "fatal", err: redact(String(e?.message ?? e)) }));
    await closeBackupPool().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
