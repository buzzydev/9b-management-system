// Faqat server: bazani JSON+gzip ko'rinishida zaxiralaydi va tiklaydi.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { backupsDir, ensureDir } from "@/lib/storage";
import { logActivity } from "@/lib/audit";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Tiklashda FK tartibida kiritiladi (o'chirishda teskari). ActivityLog va BackupRecord tegilmaydi. */
const RESTORE_ORDER = [
  "Class", "Subject", "SystemSettings", "User", "UserSettings", "Student", "TeacherNote", "QrSession", "Attendance",
  "Timetable", "Homework", "HomeworkSubmission", "Grade", "GradeHistory", "CalendarEvent", "Announcement",
  "AnnouncementRead", "Notification", "Thread", "ThreadMember", "Message", "Achievement", "EscapeRecord",
  "DutySettings", "DutyMember", "DutyAssignment",
];

const models = () => Prisma.dmmf.datamodel.models;
const delegate = (name: string) => (prisma as unknown as Record<string, any>)[lowerFirst(name)];

type Dump = { version: 1; createdAt: string; tables: Record<string, Record<string, unknown>[]> };

export async function createBackup(userId: string | null, label = "backup") {
  const rec = await prisma.backupRecord.create({
    data: { filename: "pending", storagePath: "", status: "PENDING", createdById: userId },
  });
  try {
    const tables: Dump["tables"] = {};
    let count = 0;
    for (const m of models()) {
      if (m.name === "BackupRecord") continue;
      const rows = await delegate(m.name).findMany();
      tables[m.name] = rows;
      count += rows.length;
    }
    const dump: Dump = { version: 1, createdAt: new Date().toISOString(), tables };
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(dump), "utf8"), { level: 9 });
    const checksum = createHash("sha256").update(gz).digest("hex");
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const filename = `ninebee-${label}-${stamp}-${rec.id.slice(-6)}.json.gz`;

    // Ikki nusxa: Volume'dagi fayl (bo'lsa) + Postgres'dagi bayt maydoni (Volume'siz ham yo'qolmaydi)
    let storagePath = "db";
    try {
      await ensureDir(backupsDir());
      storagePath = path.join(backupsDir(), filename);
      await fs.writeFile(storagePath, gz, { mode: 0o600 });
    } catch (e) {
      console.error(JSON.stringify({ level: "warn", msg: "backup-file-write-failed", err: String(e) }));
      storagePath = "db";
    }
    return await prisma.backupRecord.update({
      where: { id: rec.id },
      data: { filename, storagePath, sizeBytes: gz.length, checksum, recordCount: count, status: "SUCCESS", data: gz },
      select: backupSelect,
    });
  } catch (e) {
    await prisma.backupRecord.update({ where: { id: rec.id }, data: { status: "FAILED", error: String(e instanceof Error ? e.message : e).slice(0, 500) } });
    throw new HttpError(500, "Zaxira nusxa yaratib bo'lmadi");
  }
}

export const backupSelect = {
  id: true, filename: true, sizeBytes: true, checksum: true, recordCount: true, status: true, error: true,
  createdAt: true, restoredAt: true, createdBy: { select: { fullName: true } },
} satisfies Prisma.BackupRecordSelect;

export async function loadBackupBytes(id: string): Promise<{ bytes: Buffer; filename: string; checksum: string | null }> {
  const rec = await prisma.backupRecord.findUnique({ where: { id } });
  if (!rec || rec.status !== "SUCCESS") throw new HttpError(404, "Zaxira topilmadi");
  let bytes: Buffer | null = null;
  if (rec.storagePath && rec.storagePath !== "db") {
    try {
      bytes = await fs.readFile(rec.storagePath);
    } catch {
      bytes = null;
    }
  }
  if (!bytes && rec.data) bytes = Buffer.from(rec.data);
  if (!bytes) throw new HttpError(404, "Zaxira fayli topilmadi");
  const sum = createHash("sha256").update(bytes).digest("hex");
  if (rec.checksum && sum !== rec.checksum) {
    // Fayl buzilgan bo'lsa — bazadagi nusxaga o'tamiz
    if (rec.data) {
      const alt = Buffer.from(rec.data);
      if (createHash("sha256").update(alt).digest("hex") === rec.checksum) return { bytes: alt, filename: rec.filename, checksum: rec.checksum };
    }
    throw new HttpError(500, "Zaxira nusxasi buzilgan (nazorat summasi mos kelmadi)");
  }
  return { bytes, filename: rec.filename, checksum: rec.checksum };
}

function revive(modelName: string, row: Record<string, unknown>) {
  const m = models().find((x) => x.name === modelName)!;
  const out: Record<string, unknown> = { ...row };
  for (const f of m.fields) {
    if (f.kind !== "scalar") continue;
    const v = out[f.name];
    if (f.type === "DateTime" && typeof v === "string") out[f.name] = new Date(v);
    if (f.type === "Json" && v === null) out[f.name] = Prisma.DbNull;
  }
  return out;
}

export async function restoreBackup(id: string, actor: { id: string; fullName: string; role: any }, ip: string | null) {
  const { bytes } = await loadBackupBytes(id);
  let dump: Dump;
  try {
    dump = JSON.parse(zlib.gunzipSync(bytes).toString("utf8"));
  } catch {
    throw new HttpError(400, "Zaxira fayli o'qib bo'lmadi");
  }
  if (dump.version !== 1 || !dump.tables) throw new HttpError(400, "Zaxira formati qo'llab-quvvatlanmaydi");

  // Xavfsizlik tarmog'i: tiklashdan oldin joriy holatning zaxirasi
  await createBackup(actor.id, "pre-restore");

  const skippedUsers: string[] = [];
  await prisma.$transaction(
    async (tx) => {
      const t = (name: string) => (tx as unknown as Record<string, any>)[lowerFirst(name)];
      // 1) bog'liq jadvallarni teskari tartibda tozalash (User'ga tegilmaydi)
      for (const name of [...RESTORE_ORDER].reverse()) {
        if (name === "User" || name === "UserSettings") continue;
        await t(name).deleteMany();
      }
      // 2) kiritish — FK tartibida
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
      await tx.backupRecord.update({ where: { id }, data: { restoredAt: new Date() } });
      await logActivity({
        user: actor,
        action: "BACKUP_RESTORE",
        category: "backup",
        description: `Zaxiradan tiklandi (${id})${skippedUsers.length ? `; o'tkazib yuborilgan foydalanuvchilar: ${skippedUsers.join(", ")}` : ""}`,
        entityType: "BackupRecord",
        entityId: id,
        ip,
        client: tx,
      });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return { ok: true, skippedUsers };
}
