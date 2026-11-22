// Faqat server (Next route'lar VA Railway Cron skripti ishlatadi). Next.js'ga bog'liq import yo'q.
// Zaxira ALOHIDA PostgreSQL bazada (BACKUP_DATABASE_URL) saqlanadi — asosiy baza bilan bir xil bo'lishi mumkin emas.
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import zlib from "node:zlib";
import { Pool, type PoolClient } from "pg";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BACKUP_HOUR_LOCAL,
  OVERDUE_AFTER_MS,
  RETENTION_DAYS,
  STALE_RUN_MS,
  backupFileName,
  canDeleteManually,
  isSameDatabase,
  localDay,
  nextDailyRun,
  planRetention,
  redact,
  utcCronFor,
  type BackupKind,
  type BackupState,
  type RetentionRow,
} from "./backup-policy";

export const DUMP_VERSION = 2;
const CHUNK_BYTES = 4 * 1024 * 1024;
const PAGE_ROWS = 1000;
const TZ = () => process.env.APP_TIMEZONE || "Asia/Tashkent";

export type Dump = { version: number; createdAt: string; counts?: Record<string, number>; tables: Record<string, Record<string, unknown>[]> };

export type BackupItem = {
  id: string;
  filename: string;
  kind: BackupKind;
  status: BackupState;
  destination: "BACKUP_DB" | "PRIMARY";
  sizeBytes: number;
  rawBytes: number;
  recordCount: number;
  checksum: string | null;
  verified: boolean;
  verifiedAt: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  runDate: string | null;
  createdByName: string | null;
  restoredAt: string | null;
};

export class BackupError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "BACKUP",
  ) {
    super(message);
  }
}

// ───────────── Konfiguratsiya va ulanish ─────────────

export function backupUrl(): string | null {
  const u = process.env.BACKUP_DATABASE_URL?.trim();
  return u ? u : null;
}

export function backupConfigState(): { configured: boolean; sameAsPrimary: boolean } {
  const u = backupUrl();
  if (!u) return { configured: false, sameAsPrimary: false };
  const same = isSameDatabase(u, process.env.DATABASE_URL) || isSameDatabase(u, process.env.DIRECT_URL);
  return { configured: true, sameAsPrimary: same };
}

const g = globalThis as unknown as { __backupPool?: Pool; __backupSchemaReady?: boolean };

function pool(): Pool {
  const state = backupConfigState();
  if (!state.configured) throw new BackupError(503, "BACKUP_DATABASE_URL sozlanmagan — alohida zaxira bazasi ulanmagan", "NOT_CONFIGURED");
  if (state.sameAsPrimary) throw new BackupError(503, "BACKUP_DATABASE_URL asosiy bazaga ishora qilmoqda. Zaxira ALOHIDA bazada bo'lishi shart", "SAME_AS_PRIMARY");
  if (!g.__backupPool) {
    const p = new Pool({
      connectionString: backupUrl()!,
      max: 3,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 10_000,
      statement_timeout: 120_000,
      query_timeout: 130_000,
    });
    p.on("error", (e) => console.error(JSON.stringify({ level: "error", scope: "backup", msg: "pool-error", err: redact(String(e)) })));
    g.__backupPool = p;
  }
  return g.__backupPool;
}

export async function closeBackupPool() {
  const p = g.__backupPool;
  g.__backupPool = undefined;
  g.__backupSchemaReady = false;
  if (p) await p.end().catch(() => {});
}

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

async function ensureSchema() {
  if (g.__backupSchemaReady) return;
  await withClient(async (c) => {
    await c.query("BEGIN");
    try {
      await c.query("SELECT pg_advisory_xact_lock(727401)");
      await c.query(`
        CREATE TABLE IF NOT EXISTS ninebee_backups (
          id             text PRIMARY KEY,
          kind           text NOT NULL CHECK (kind IN ('DAILY','MANUAL','PRE_RESTORE')),
          status         text NOT NULL CHECK (status IN ('PENDING','VERIFYING','SUCCESS','FAILED')),
          filename       text NOT NULL,
          run_date       date,
          created_at     timestamptz NOT NULL DEFAULT now(),
          finished_at    timestamptz,
          size_bytes     bigint NOT NULL DEFAULT 0,
          raw_bytes      bigint NOT NULL DEFAULT 0,
          record_count   integer NOT NULL DEFAULT 0,
          chunk_count    integer NOT NULL DEFAULT 0,
          checksum       text,
          verified       boolean NOT NULL DEFAULT false,
          verified_at    timestamptz,
          error          text,
          expires_at     timestamptz,
          created_by     text,
          created_by_name text,
          restored_at    timestamptz
        )`);
      await c.query(`
        CREATE TABLE IF NOT EXISTS ninebee_backup_chunks (
          backup_id text NOT NULL REFERENCES ninebee_backups(id) ON DELETE CASCADE,
          seq       integer NOT NULL,
          data      bytea NOT NULL,
          PRIMARY KEY (backup_id, seq)
        )`);
      // "Har kuni aynan bitta zaxira": bir kunga faqat bitta faol/muvaffaqiyatli kunlik yozuv
      await c.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ninebee_backups_daily_once
        ON ninebee_backups (run_date) WHERE kind = 'DAILY' AND status IN ('PENDING','VERIFYING','SUCCESS')`);
      await c.query("CREATE INDEX IF NOT EXISTS ninebee_backups_created_idx ON ninebee_backups (created_at DESC)");
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });
  g.__backupSchemaReady = true;
}

export async function checkBackupConnection(): Promise<{ configured: boolean; sameAsPrimary: boolean; ok: boolean; latencyMs: number | null; error: string | null }> {
  const state = backupConfigState();
  if (!state.configured || state.sameAsPrimary) {
    return { ...state, ok: false, latencyMs: null, error: state.sameAsPrimary ? "Zaxira bazasi asosiy bazaning o'zi" : null };
  }
  const t0 = Date.now();
  try {
    await ensureSchema();
    await withClient((c) => c.query("SELECT 1"));
    return { ...state, ok: true, latencyMs: Date.now() - t0, error: null };
  } catch (e) {
    return { ...state, ok: false, latencyMs: Date.now() - t0, error: redact(e instanceof Error ? e.message : String(e)) };
  }
}

// ───────────── Dump (asosiy bazadan) ─────────────

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

class GzipCollector {
  private gz = zlib.createGzip({ level: 9 });
  private parts: Buffer[] = [];
  private done: Promise<void>;
  raw = 0;
  constructor() {
    this.gz.on("data", (b: Buffer) => this.parts.push(b));
    this.done = new Promise((res, rej) => {
      this.gz.on("end", () => res());
      this.gz.on("error", rej);
    });
  }
  async write(s: string) {
    this.raw += Buffer.byteLength(s);
    if (!this.gz.write(s)) await once(this.gz, "drain");
  }
  async finish(): Promise<Buffer> {
    this.gz.end();
    await this.done;
    return Buffer.concat(this.parts);
  }
}

/** Barcha jadvallarni (BackupRecord'dan tashqari) bitta izchil snapshot'da o'qib, gzip'lanган JSON qaytaradi. */
export async function dumpPrimary(): Promise<{ gz: Buffer; rawBytes: number; counts: Record<string, number>; total: number }> {
  const models = Prisma.dmmf.datamodel.models.filter((m) => m.name !== "BackupRecord");
  const out = new GzipCollector();
  const counts: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      await out.write(`{"version":${DUMP_VERSION},"createdAt":${JSON.stringify(new Date().toISOString())},"tables":{`);
      let firstTable = true;
      for (const m of models) {
        const d = (tx as unknown as Record<string, any>)[lowerFirst(m.name)];
        const idField = m.fields.find((f) => f.isId)?.name;
        await out.write(`${firstTable ? "" : ","}${JSON.stringify(m.name)}:[`);
        firstTable = false;
        let n = 0;
        let cursor: unknown = undefined;
        for (;;) {
          const rows: Record<string, unknown>[] = idField
            ? await d.findMany({ take: PAGE_ROWS, orderBy: { [idField]: "asc" }, ...(cursor !== undefined ? { skip: 1, cursor: { [idField]: cursor } } : {}) })
            : await d.findMany();
          if (rows.length) await out.write((n ? "," : "") + rows.map((r) => JSON.stringify(r)).join(","));
          n += rows.length;
          if (!idField || rows.length < PAGE_ROWS) break;
          cursor = rows[rows.length - 1][idField];
        }
        counts[m.name] = n;
        await out.write("]");
      }
      await out.write(`},"counts":${JSON.stringify(counts)}}`);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10 * 60_000, maxWait: 20_000 },
  );
  const gz = await out.finish();
  return { gz, rawBytes: out.raw, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export function parseDump(gz: Buffer): Dump {
  let dump: Dump;
  try {
    dump = JSON.parse(zlib.gunzipSync(gz).toString("utf8"));
  } catch {
    throw new BackupError(400, "Zaxira fayli o'qib bo'lmadi", "UNREADABLE");
  }
  if (![1, 2].includes(dump.version) || !dump.tables || typeof dump.tables !== "object") throw new BackupError(400, "Zaxira formati qo'llab-quvvatlanmaydi", "FORMAT");
  return dump;
}

// ───────────── Yozish / tekshirish ─────────────

const rowToItem = (r: any): BackupItem => ({
  id: r.id,
  filename: r.filename,
  kind: r.kind,
  status: r.status,
  destination: "BACKUP_DB",
  sizeBytes: Number(r.size_bytes),
  rawBytes: Number(r.raw_bytes),
  recordCount: r.record_count,
  checksum: r.checksum,
  verified: r.verified,
  verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
  error: r.error,
  createdAt: new Date(r.created_at).toISOString(),
  finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
  runDate: r.run_date ? (r.run_date instanceof Date ? r.run_date.toISOString().slice(0, 10) : String(r.run_date).slice(0, 10)) : null,
  createdByName: r.created_by_name,
  restoredAt: r.restored_at ? new Date(r.restored_at).toISOString() : null,
});

export async function getBackupItem(id: string): Promise<BackupItem | null> {
  await ensureSchema();
  const r = await withClient((c) => c.query("SELECT *, run_date::text AS run_date FROM ninebee_backups WHERE id = $1", [id]));
  return r.rows[0] ? rowToItem(r.rows[0]) : null;
}

async function readChunks(id: string): Promise<Buffer> {
  const r = await withClient((c) => c.query("SELECT data FROM ninebee_backup_chunks WHERE backup_id = $1 ORDER BY seq", [id]));
  return Buffer.concat(r.rows.map((x: { data: Buffer }) => x.data));
}

/** Saqlangan nusxani bazadan qayta o'qib: SHA-256, gzip, JSON va jadvallar bo'yicha yozuvlar sonini solishtiradi. */
async function verifyStored(id: string, expectedSha: string, expectedCounts: Record<string, number>): Promise<void> {
  const bytes = await readChunks(id);
  if (sha256(bytes) !== expectedSha) throw new Error("Tekshiruv: nazorat summasi mos kelmadi");
  const dump = parseDump(bytes);
  for (const [name, n] of Object.entries(expectedCounts)) {
    const got = dump.tables[name]?.length ?? -1;
    if (got !== n) throw new Error(`Tekshiruv: ${name} jadvalida ${n} ta yozuv kutilgan, ${got} ta topildi`);
  }
}

export type RunResult =
  | { outcome: "created"; backup: BackupItem; deleted: number }
  | { outcome: "skipped"; reason: "ALREADY_DONE" | "IN_PROGRESS"; backup: BackupItem | null };

export async function runBackup(opts: { kind: BackupKind; createdBy?: { id: string; name: string } | null; now?: Date }): Promise<RunResult> {
  const now = opts.now ?? new Date();
  await ensureSchema();
  const runDate = opts.kind === "DAILY" ? localDay(now, TZ()) : null;

  // 1) Kunlik zaxira takrorlanmasligi
  if (runDate) {
    const ex = await withClient((c) => c.query("SELECT *, run_date::text AS run_date FROM ninebee_backups WHERE kind = 'DAILY' AND run_date = $1 AND status IN ('PENDING','VERIFYING','SUCCESS')", [runDate]));
    const row = ex.rows[0];
    if (row) {
      if (row.status === "SUCCESS") return { outcome: "skipped", reason: "ALREADY_DONE", backup: rowToItem(row) };
      if (Date.now() - new Date(row.created_at).getTime() < STALE_RUN_MS) return { outcome: "skipped", reason: "IN_PROGRESS", backup: rowToItem(row) };
      await markFailed(row.id, "Eskirgan (to'xtab qolgan) urinish — yangisi boshlandi");
    }
  }

  // 2) Yozuvni band qilish (unique indeks ikkinchi parallel ishga tushishni to'xtatadi)
  const id = `nb_${randomBytes(12).toString("hex")}`;
  const filename = backupFileName(opts.kind, now, id);
  try {
    await withClient((c) =>
      c.query(
        `INSERT INTO ninebee_backups (id, kind, status, filename, run_date, created_at, created_by, created_by_name, expires_at)
         VALUES ($1,$2,'PENDING',$3,$4,$5,$6,$7,$8)`,
        [id, opts.kind, filename, runDate, now, opts.createdBy?.id ?? null, opts.createdBy?.name ?? "Tizim", new Date(now.getTime() + RETENTION_DAYS * 86400000)],
      ),
    );
  } catch (e: any) {
    if (e?.code === "23505") {
      const ex = await withClient((c) => c.query("SELECT *, run_date::text AS run_date FROM ninebee_backups WHERE kind='DAILY' AND run_date=$1 AND status IN ('PENDING','VERIFYING','SUCCESS')", [runDate]));
      return { outcome: "skipped", reason: ex.rows[0]?.status === "SUCCESS" ? "ALREADY_DONE" : "IN_PROGRESS", backup: ex.rows[0] ? rowToItem(ex.rows[0]) : null };
    }
    throw e;
  }

  try {
    // 3) Dump
    const { gz, rawBytes, counts, total } = await dumpPrimary();
    const checksum = sha256(gz);

    // 4) Bo'laklab yozish (bitta tranzaksiya — yarim yozilgan nusxa qolmaydi)
    await withClient(async (c) => {
      await c.query("BEGIN");
      try {
        let seq = 0;
        for (let off = 0; off < gz.length || seq === 0; off += CHUNK_BYTES) {
          await c.query("INSERT INTO ninebee_backup_chunks (backup_id, seq, data) VALUES ($1,$2,$3)", [id, seq++, gz.subarray(off, off + CHUNK_BYTES)]);
        }
        await c.query("UPDATE ninebee_backups SET status='VERIFYING', size_bytes=$2, raw_bytes=$3, record_count=$4, chunk_count=$5, checksum=$6 WHERE id=$1", [id, gz.length, rawBytes, total, seq, checksum]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    });

    // 5) Tekshirish — faqat shundan keyin SUCCESS
    await verifyStored(id, checksum, counts);
    await withClient((c) => c.query("UPDATE ninebee_backups SET status='SUCCESS', verified=true, verified_at=now(), finished_at=now(), error=NULL WHERE id=$1", [id]));
  } catch (e) {
    await markFailed(id, redact(e instanceof Error ? e.message : String(e)));
    throw new BackupError(500, "Zaxira nusxa yaratilmadi yoki tekshiruvdan o'tmadi", "RUN_FAILED");
  }

  // 6) Saqlash siyosati (xatosi zaxiraning o'ziga ta'sir qilmaydi)
  let deleted = 0;
  try {
    deleted = (await applyRetention()).deleted;
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", scope: "backup", msg: "retention-failed", err: redact(String(e)) }));
  }
  const backup = (await getBackupItem(id))!;
  return { outcome: "created", backup, deleted };
}

async function markFailed(id: string, message: string) {
  try {
    await withClient(async (c) => {
      await c.query("DELETE FROM ninebee_backup_chunks WHERE backup_id = $1", [id]);
      await c.query("UPDATE ninebee_backups SET status='FAILED', verified=false, error=$2, finished_at=now() WHERE id=$1", [id, message.slice(0, 500)]);
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", scope: "backup", msg: "mark-failed-error", err: redact(String(e)) }));
  }
}

// ───────────── Saqlash muddati ─────────────

async function allRetentionRows(): Promise<RetentionRow[]> {
  const r = await withClient((c) => c.query("SELECT id, kind, status, verified, run_date::text AS run_date, created_at FROM ninebee_backups"));
  return r.rows.map((x: any) => ({ id: x.id, kind: x.kind, status: x.status, verified: x.verified, runDate: x.run_date ? String(x.run_date).slice(0, 10) : null, createdAt: new Date(x.created_at) }));
}

export async function applyRetention(now = new Date()): Promise<{ deleted: number; kept: number }> {
  await ensureSchema();
  const plan = planRetention(await allRetentionRows(), now);
  if (plan.deleteIds.length) await withClient((c) => c.query("DELETE FROM ninebee_backups WHERE id = ANY($1::text[])", [plan.deleteIds])); // chunks CASCADE
  return { deleted: plan.deleteIds.length, kept: plan.keepIds.length };
}

// ───────────── O'qish / yuklab olish / o'chirish ─────────────

export async function listBackupDb(limit = 100): Promise<BackupItem[]> {
  await ensureSchema();
  const r = await withClient((c) => c.query("SELECT *, run_date::text AS run_date FROM ninebee_backups ORDER BY created_at DESC LIMIT $1", [limit]));
  return r.rows.map(rowToItem);
}

export async function loadBackupDbBytes(id: string): Promise<{ bytes: Buffer; filename: string; checksum: string }> {
  const item = await getBackupItem(id);
  if (!item || item.status !== "SUCCESS" || !item.verified || !item.checksum) throw new BackupError(404, "Zaxira topilmadi", "NOT_FOUND");
  const bytes = await readChunks(id);
  if (sha256(bytes) !== item.checksum) throw new BackupError(500, "Zaxira nusxasi buzilgan (nazorat summasi mos kelmadi)", "CORRUPT");
  return { bytes, filename: item.filename, checksum: item.checksum };
}

export async function deleteBackupDb(id: string): Promise<BackupItem> {
  const item = await getBackupItem(id);
  if (!item) throw new BackupError(404, "Zaxira topilmadi", "NOT_FOUND");
  const rows = await allRetentionRows();
  const target = rows.find((r) => r.id === id)!;
  const verdict = canDeleteManually(target, rows, localDay(new Date(), TZ()));
  if (!verdict.ok) throw new BackupError(409, verdict.reason ?? "O'chirib bo'lmaydi", "PROTECTED");
  await withClient((c) => c.query("DELETE FROM ninebee_backups WHERE id = $1", [id]));
  return item;
}

export async function markRestoredDb(id: string) {
  await withClient((c) => c.query("UPDATE ninebee_backups SET restored_at = now() WHERE id = $1", [id]));
}

// ───────────── Holat (dashboard) ─────────────

export type BackupOverview = {
  configured: boolean;
  sameAsPrimary: boolean;
  schedule: { cron: string; timezone: string; localTime: string; nextRunAt: string };
  lastSuccessAt: string | null;
  lastDailyAt: string | null;
  overdue: boolean;
  items: BackupItem[];
};

export function scheduleInfo(now = new Date()) {
  let cron = "";
  try {
    cron = utcCronFor(TZ());
  } catch {
    cron = "—";
  }
  return {
    cron,
    timezone: TZ(),
    localTime: `${String(BACKUP_HOUR_LOCAL).padStart(2, "0")}:00`,
    nextRunAt: nextDailyRun(now, TZ()).toISOString(),
  };
}

export function computeOverdue(lastDailySuccess: Date | null, now = new Date()): boolean {
  if (!lastDailySuccess) return false;
  return now.getTime() - lastDailySuccess.getTime() > OVERDUE_AFTER_MS;
}

// ───────────── Xato haqida adminlarga xabar (Cron'dan ham ishlaydi) ─────────────

export async function notifyAdminsBackupFailure(message: string) {
  try {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
    const day = localDay(new Date(), TZ());
    for (const a of admins) {
      await prisma.notification
        .create({ data: { userId: a.id, type: "SYSTEM", title: "Avtomatik zaxira nusxa YARATILMADI", body: message.slice(0, 300), link: "/admin/backup", dedupeKey: `backup-fail-${day}` } })
        .catch(() => {}); // bir kunga bitta xabar (dedupeKey unique)
    }
    await prisma.activityLog.create({
      data: { userName: "Tizim", action: "BACKUP_FAILED", category: "backup", description: message.slice(0, 1000), entityType: "Backup" },
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", scope: "backup", msg: "notify-failed", err: redact(String(e)) }));
  }
}
