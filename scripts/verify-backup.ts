/**
 * Zaxira tizimini HAQIQIY bazalarda tekshiradi (sizning muhitingizda, .env sozlangan bo'lishi kerak):
 *   npm run verify:backup
 * Asosiy bazaga hech narsa yozmaydi. Zaxira bazasida vaqtinchalik yozuvlar yaratib, oxirida o'chiradi.
 */
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  applyRetention, backupConfigState, checkBackupConnection, closeBackupPool, deleteBackupDb, getBackupItem,
  listBackupDb, loadBackupDbBytes, parseDump, runBackup,
} from "@/lib/services/backup-core";

const results: { name: string; ok: boolean; info?: string }[] = [];
const check = (name: string, ok: boolean, info = "") => {
  results.push({ name, ok, info });
  console.log(`${ok ? "✔" : "✘"} ${name}${info ? ` — ${info}` : ""}`);
};
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

async function main() {
  const cfg = backupConfigState();
  check("BACKUP_DATABASE_URL sozlangan", cfg.configured);
  check("asosiy bazadan farq qiladi", cfg.configured && !cfg.sameAsPrimary);
  if (!cfg.configured || cfg.sameAsPrimary) return;

  const conn = await checkBackupConnection();
  check("zaxira bazasiga ulanish va jadvallar yaratilishi", conn.ok, conn.ok ? `${conn.latencyMs} ms` : conn.error ?? "");
  if (!conn.ok) return;

  const created: string[] = [];
  try {
    // 1) Qo'lda zaxira: yozish + tekshirish
    const r = await runBackup({ kind: "MANUAL", createdBy: null });
    check("qo'lda zaxira yaratildi", r.outcome === "created");
    if (r.outcome !== "created") return;
    const b = r.backup;
    created.push(b.id);
    check("holat SUCCESS va tekshirilgan", b.status === "SUCCESS" && b.verified, `${b.recordCount} yozuv, ${b.sizeBytes} bayt`);

    // 2) Bazadagi nusxa asosiy bazaga mos keladimi
    const { bytes, checksum } = await loadBackupDbBytes(b.id);
    check("yuklab olingan nusxaning SHA-256 mos", checksum === b.checksum);
    const dump = parseDump(bytes);
    let mismatches = 0;
    for (const m of Prisma.dmmf.datamodel.models) {
      if (m.name === "BackupRecord") continue;
      const live = await (prisma as unknown as Record<string, any>)[lower(m.name)].count();
      const saved = dump.tables[m.name]?.length ?? -1;
      // Zaxira olingandan keyin yozuv qo'shilishi mumkin (ActivityLog) — faqat kamayish/yo'qolishni xato deymiz
      if (saved < 0 || saved > live) mismatches++;
    }
    check("barcha jadvallar zaxirada bor", mismatches === 0, mismatches ? `${mismatches} ta jadval mos emas` : "");

    // 3) Kunlik zaxira takrorlanmasligi (o'tmishdagi soxta sana bilan — haqiqiy kunga tegmaydi)
    const fake = new Date("2000-01-01T12:00:00Z");
    const d1 = await runBackup({ kind: "DAILY", now: fake });
    if (d1.outcome === "created") created.push(d1.backup.id);
    const d2 = await runBackup({ kind: "DAILY", now: fake });
    check("bir kunga bitta kunlik zaxira (takror o'tkazib yuboriladi)", d1.outcome === "created" && d2.outcome === "skipped" && d2.reason === "ALREADY_DONE");

    // 4) Saqlash siyosati yaroqli zaxirani o'chirib yubormaydi
    await applyRetention();
    const after = await listBackupDb(200);
    check("saqlash tozalashidan keyin kamida bitta yaroqli zaxira bor", after.some((x) => x.status === "SUCCESS" && x.verified));
    check("bugungi/yangi zaxira o'chmagan", !!(await getBackupItem(b.id)));
  } catch (e) {
    check("kutilmagan xato", false, e instanceof Error ? e.message : String(e));
  } finally {
    for (const id of created) await deleteBackupDb(id).catch(() => {}); // sinov yozuvlarini tozalash
  }
}

main()
  .catch((e) => check("fatal", false, String(e)))
  .finally(async () => {
    await closeBackupPool();
    await prisma.$disconnect();
    const failed = results.filter((r) => !r.ok).length;
    console.log(failed ? `\n${failed} ta tekshiruv muvaffaqiyatsiz` : "\nHammasi o'tdi");
    process.exit(failed ? 1 : 0);
  });
