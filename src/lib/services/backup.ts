// Faqat server: zaxira nusxalar bilan ishlash uchun yagona kirish nuqtasi (Next route'lar shuni chaqiradi).
// Asosiy yo'l — ALOHIDA zaxira bazasi (BACKUP_DATABASE_URL). U sozlanmagan bo'lsa, faqat qo'lda yaratiladigan
// «himoyasiz» eski usul (asosiy baza + Volume) ishlaydi va UI buni ochiq ogohlantiradi.
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { backupsDir, ensureDir } from "@/lib/storage";
import { logActivity } from "@/lib/audit";
import { auditActor, type SessionLike } from "@/lib/audit-actor";
import { localDay } from "./backup-policy";
import {
  BackupError,
  backupConfigState,
  checkBackupConnection,
  computeOverdue,
  deleteBackupDb,
  dumpPrimary,
  listBackupDb,
  loadBackupDbBytes,
  markRestoredDb,
  parseDump,
  runBackup,
  scheduleInfo,
  sha256,
  type BackupItem,
  type BackupOverview,
} from "./backup-core";

export type { BackupItem, BackupOverview } from "./backup-core";

const TZ = () => process.env.APP_TIMEZONE || "Asia/Tashkent";
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const isDbId = (id: string) => id.startsWith("nb_");

/** BackupError → HttpError (route() xatolarni shu orqali foydalanuvchiga chiroyli qaytaradi). */
function wrap<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if (e instanceof BackupError) throw new HttpError(e.status, e.message, e.code);
    throw e;
  });
}

/** Tiklashda FK tartibida kiritiladi (o'chirishda teskari). ActivityLog va BackupRecord tegilmaydi. */
const RESTORE_ORDER = [
  "Class", "Subject", "SystemSettings", "User", "UserSettings", "Student", "TeacherNote", "QrSession", "Attendance",
  "Timetable", "Homework", "HomeworkSubmission", "Grade", "GradeHistory", "CalendarEvent", "Announcement",
  "AnnouncementRead", "Notification", "Thread", "ThreadMember", "Message", "Achievement", "EscapeRecord",
  "DutySettings", "DutyMember", "DutyAssignment",
];

const legacySelect = {
  id: true, filename: true, sizeBytes: true, checksum: true, recordCount: true, status: true, error: true,
  createdAt: true, restoredAt: true, createdBy: { select: { fullName: true } },
} satisfies Prisma.BackupRecordSelect;

type LegacyRow = Prisma.BackupRecordGetPayload<{ select: typeof legacySelect }>;

function legacyToItem(r: LegacyRow): BackupItem {
  const ok = r.status === "SUCCESS";
  return {
    id: r.id,
    filename: r.filename,
    kind: "MANUAL",
    status: r.status,
    destination: "PRIMARY",
    sizeBytes: r.sizeBytes,
    rawBytes: 0,
    recordCount: r.recordCount,
    checksum: r.checksum,
    verified: ok && !!r.checksum,
    verifiedAt: ok ? r.createdAt.toISOString() : null,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.createdAt.toISOString(),
    expiresAt: null,
    runDate: null,
    createdByName: r.createdBy?.fullName ?? "Tizim",
    restoredAt: r.restoredAt ? r.restoredAt.toISOString() : null,
  };
}

// ───────────── Yaratish ─────────────

type Actor = { id: string; fullName: string };

async function createLegacyBackup(userId: string | null): Promise<BackupItem> {
  const rec = await prisma.backupRecord.create({ data: { filename: "pending", storagePath: "", status: "PENDING", createdById: userId } });
  try {
    const { gz, total } = await dumpPrimary();
    const checksum = sha256(gz);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const filename = `ninebee-manual-${stamp}-${rec.id.slice(-6)}.json.gz`;
    let storagePath = "db";
    try {
      await ensureDir(backupsDir());
      storagePath = path.join(backupsDir(), filename);
      await fs.writeFile(storagePath, gz, { mode: 0o600 });
    } catch (e) {
      console.error(JSON.stringify({ level: "warn", msg: "backup-file-write-failed", err: String(e) }));
      storagePath = "db";
    }
    await prisma.backupRecord.update({ where: { id: rec.id }, data: { filename, storagePath, sizeBytes: gz.length, checksum, recordCount: total, data: gz } });
    // Tekshirish: bazadan qayta o'qib nazorat summasini solishtiramiz — shundan keyingina SUCCESS
    const back = await prisma.backupRecord.findUnique({ where: { id: rec.id }, select: { data: true } });
    if (!back?.data || sha256(Buffer.from(back.data)) !== checksum) throw new Error("Tekshiruv: saqlangan nusxa nazorat summasiga mos kelmadi");
    parseDump(Buffer.from(back.data));
    const done = await prisma.backupRecord.update({ where: { id: rec.id }, data: { status: "SUCCESS" }, select: legacySelect });
    return legacyToItem(done);
  } catch (e) {
    await prisma.backupRecord.update({ where: { id: rec.id }, data: { status: "FAILED", error: String(e instanceof Error ? e.message : e).slice(0, 500), data: null } }).catch(() => {});
    throw new HttpError(500, "Zaxira nusxa yaratib bo'lmadi");
  }
}

/** Qo'lda zaxira (yoki tiklashdan oldingi xavfsizlik nusxasi). Alohida baza sozlangan bo'lsa — shu yerga, aks holda eski usul. */
export async function createBackup(actor: Actor | null, kind: "MANUAL" | "PRE_RESTORE" = "MANUAL"): Promise<BackupItem> {
  const cfg = backupConfigState();
  if (cfg.sameAsPrimary) throw new HttpError(503, "BACKUP_DATABASE_URL asosiy bazaga ishora qilmoqda. Zaxira ALOHIDA bazada bo'lishi shart", "SAME_AS_PRIMARY");
  if (!cfg.configured) return createLegacyBackup(actor?.id ?? null);
  const res = await wrap(runBackup({ kind, createdBy: actor ? { id: actor.id, name: actor.fullName } : null }));
  if (res.outcome !== "created") throw new HttpError(409, "Zaxira allaqachon yaratilmoqda");
  return res.backup;
}

// ───────────── Ro'yxat va holat ─────────────

type Connection = Awaited<ReturnType<typeof checkBackupConnection>>;

export async function getBackupOverview(): Promise<BackupOverview & { connection: Connection | null; connectionError: string | null }> {
  const cfg = backupConfigState();
  const legacyRows = await prisma.backupRecord.findMany({ select: legacySelect, orderBy: { createdAt: "desc" }, take: 50 });
  const legacy = legacyRows.map(legacyToItem);

  let items: BackupItem[] = [];
  let connection: Connection | null = null;
  let connectionError: string | null = null;
  if (cfg.configured && !cfg.sameAsPrimary) {
    connection = await checkBackupConnection();
    if (connection.ok) {
      try {
        items = await listBackupDb(100);
      } catch (e) {
        connectionError = e instanceof Error ? e.message : String(e);
      }
    } else connectionError = connection.error;
  }

  const all = [...items, ...legacy].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastOk = all.find((i) => i.status === "SUCCESS" && i.verified);
  const lastDaily = items.find((i) => i.kind === "DAILY" && i.status === "SUCCESS" && i.verified);
  return {
    configured: cfg.configured,
    sameAsPrimary: cfg.sameAsPrimary,
    schedule: scheduleInfo(),
    lastSuccessAt: lastOk?.createdAt ?? null,
    lastDailyAt: lastDaily?.createdAt ?? null,
    overdue: cfg.configured && !cfg.sameAsPrimary && computeOverdue(lastDaily ? new Date(lastDaily.createdAt) : null),
    items: all,
    connection,
    connectionError,
  };
}

// ───────────── Yuklab olish ─────────────

export async function loadBackupBytes(id: string): Promise<{ bytes: Buffer; filename: string; checksum: string | null }> {
  if (isDbId(id)) return wrap(loadBackupDbBytes(id));
  const rec = await prisma.backupRecord.findUnique({ where: { id } });
  if (!rec || rec.status !== "SUCCESS") throw new HttpError(404, "Zaxira topilmadi");
  const matches = (b: Buffer) => !rec.checksum || sha256(b) === rec.checksum;
  let bytes: Buffer | null = null;
  if (rec.storagePath && rec.storagePath !== "db") {
    bytes = await fs.readFile(rec.storagePath).catch(() => null);
    if (bytes && !matches(bytes)) bytes = null; // fayl buzilgan — bazadagi nusxaga o'tamiz
  }
  if (!bytes && rec.data) {
    const alt = Buffer.from(rec.data);
    if (matches(alt)) bytes = alt;
  }
  if (!bytes) throw new HttpError(500, "Zaxira nusxasi topilmadi yoki buzilgan (nazorat summasi mos kelmadi)");
  return { bytes, filename: rec.filename, checksum: rec.checksum };
}

// ───────────── O'chirish ─────────────

export async function deleteBackup(id: string): Promise<{ filename: string }> {
  if (isDbId(id)) {
    const it = await wrap(deleteBackupDb(id));
    return { filename: it.filename };
  }
  const rec = await prisma.backupRecord.findUnique({ where: { id }, select: { id: true, filename: true, storagePath: true } });
  if (!rec) throw new HttpError(404, "Zaxira topilmadi");
  await prisma.backupRecord.delete({ where: { id: rec.id } });
  if (rec.storagePath && rec.storagePath !== "db") await fs.unlink(rec.storagePath).catch(() => {});
  return { filename: rec.filename };
}

// ───────────── Tiklash ─────────────

function revive(modelName: string, row: Record<string, unknown>) {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modelName)!;
  const out: Record<string, unknown> = { ...row };
  for (const f of m.fields) {
    if (f.kind !== "scalar") continue;
    const v = out[f.name];
    if (f.type === "DateTime" && typeof v === "string") out[f.name] = new Date(v);
    if (f.type === "Json" && v === null) out[f.name] = Prisma.DbNull;
  }
  return out;
}

export async function restoreBackup(id: string, actor: SessionLike, ip: string | null) {
  const { bytes } = await loadBackupBytes(id);
  let dump;
  try {
    dump = parseDump(bytes);
  } catch (e) {
    if (e instanceof BackupError) throw new HttpError(e.status, e.message, e.code);
    throw e;
  }

  // Xavfsizlik tarmog'i: tiklashdan oldin joriy holatning zaxirasi. U yaratilmasa — tiklash BEKOR qilinadi.
  const safety = await createBackup(actor, "PRE_RESTORE");

  const skippedUsers: string[] = [];
  await prisma.$transaction(
    async (tx) => {
      const t = (name: string) => (tx as unknown as Record<string, any>)[lowerFirst(name)];
      for (const name of [...RESTORE_ORDER].reverse()) {
        if (name === "User" || name === "UserSettings") continue;
        await t(name).deleteMany();
      }
      for (const name of RESTORE_ORDER) {
        const rows = (dump.tables[name] ?? []) as Record<string, unknown>[];
        if (name === "User") {
          const existing = await tx.user.findMany({ select: { id: true, username: true } });
          const byName = new Map(existing.map((u) => [u.username, u.id]));
          for (const raw of rows) {
            const r = revive(name, raw) as any;
            if (r.id === actor.id) continue; // joriy adminni qulflab qo'ymaslik uchun
            const owner = byName.get(r.username);
            if (owner && owner !== r.id) {
              skippedUsers.push(r.username);
              continue;
            }
            await tx.user.upsert({ where: { id: r.id }, update: r, create: r });
          }
          continue;
        }
        if (name === "UserSettings") {
          const userIds = new Set((await tx.user.findMany({ select: { id: true } })).map((u) => u.id));
          for (const raw of rows) {
            const r = revive(name, raw) as any;
            if (!userIds.has(r.userId) || r.userId === actor.id) continue;
            await tx.userSettings.upsert({ where: { userId: r.userId }, update: r, create: r });
          }
          continue;
        }
        const valid = rows.map((r) => revive(name, r));
        for (let i = 0; i < valid.length; i += 500) {
          await t(name).createMany({ data: valid.slice(i, i + 500), skipDuplicates: true });
        }
      }
      await logActivity({
        ...auditActor(actor),
        action: "BACKUP_RESTORE",
        category: "backup",
        description: `Zaxiradan tiklandi (${id}); xavfsizlik nusxasi: ${safety.filename}${skippedUsers.length ? `; o'tkazib yuborilgan foydalanuvchilar: ${skippedUsers.join(", ")}` : ""}`,
        entityType: "Backup",
        entityId: id,
        ip,
        client: tx,
      });
    },
    { timeout: 180_000, maxWait: 10_000 },
  );

  // Tiklangan vaqtni belgilash (asosiy tranzaksiyadan tashqarida — zaxira bazasi boshqa ulanish)
  try {
    if (isDbId(id)) await markRestoredDb(id);
    else await prisma.backupRecord.updateMany({ where: { id }, data: { restoredAt: new Date() } });
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", msg: "mark-restored-failed", err: String(e) }));
  }
  return { ok: true, skippedUsers, safetyBackup: safety.filename };
}

export const todayLocal = () => localDay(new Date(), TZ());
