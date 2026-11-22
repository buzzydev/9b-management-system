// Zaxira siyosati — sof funksiyalar (bazaga/tarmoqqa tegmaydi, shuning uchun to'liq testlanadi).

export const BACKUP_HOUR_LOCAL = 3; // 03:00 APP_TIMEZONE bo'yicha
export const DAILY_KEEP = 7; // eng so'nggi 7 ta kunlik zaxira
export const RETENTION_DAYS = 7; // qo'lda/tiklashdan oldingi zaxiralar uchun saqlash muddati
export const STALE_RUN_MS = 30 * 60_000; // 30 daqiqadan oshgan PENDING/VERIFYING — to'xtab qolgan
export const FAILED_KEEP_DAYS = 7; // xato qaydlari (metadata) shuncha kun ko'rinib turadi
export const OVERDUE_AFTER_MS = 26 * 3600_000; // oxirgi kunlik zaxira 26 soatdan eski bo'lsa — ogohlantirish

export type BackupKind = "DAILY" | "MANUAL" | "PRE_RESTORE";
export type BackupState = "PENDING" | "VERIFYING" | "SUCCESS" | "FAILED";

export type RetentionRow = {
  id: string;
  kind: BackupKind;
  status: BackupState;
  verified: boolean;
  runDate: string | null; // "YYYY-MM-DD" (faqat DAILY)
  createdAt: Date;
};

/** IANA vaqt mintaqasining `at` onidagi UTC'dan farqi (millisekund). */
export function tzOffsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Mahalliy "YYYY-MM-DD" + soat:daqiqa ni UTC Date'ga aylantiradi. */
export function localToUtc(day: string, hour: number, minute: number, tz: string): Date {
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`);
  // ikki marta aniqlash — DST chegarasida ham to'g'ri bo'lishi uchun
  const first = new Date(guess.getTime() - tzOffsetMs(guess, tz));
  return new Date(guess.getTime() - tzOffsetMs(first, tz));
}

export function localDay(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function addDay(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

/** Keyingi rejalashtirilgan zaxira onini (UTC) qaytaradi: eng yaqin kelajakdagi 03:00 mahalliy vaqt. */
export function nextDailyRun(now: Date, tz: string, hour = BACKUP_HOUR_LOCAL): Date {
  const today = localDay(now, tz);
  const t = localToUtc(today, hour, 0, tz);
  return t.getTime() > now.getTime() ? t : localToUtc(addDay(today, 1), hour, 0, tz);
}

/**
 * Railway Cron UTC'da ishlaydi. Mahalliy soatni UTC cron ifodasiga aylantiradi.
 * Faqat DST'siz mintaqalar uchun barqaror (Asia/Tashkent: UTC+5 → 03:00 = 22:00 UTC oldingi kuni).
 */
export function utcCronFor(tz: string, hour = BACKUP_HOUR_LOCAL, minute = 0): string {
  const ref = new Date(Date.UTC(2026, 0, 15, 12, 0, 0)); // qish
  const ref2 = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // yoz
  if (tzOffsetMs(ref, tz) !== tzOffsetMs(ref2, tz)) {
    throw new Error(`${tz} yozgi/qishki vaqtga o'tadi — UTC cron barqaror emas`);
  }
  const offMin = Math.round(tzOffsetMs(ref, tz) / 60000);
  const utcMin = (((hour * 60 + minute - offMin) % 1440) + 1440) % 1440;
  return `${utcMin % 60} ${Math.floor(utcMin / 60)} * * *`;
}

/** Ikkita ulanish manzili bir xil bazaga ishora qiladimi (host + port + baza nomi). Parolga qaramaydi. */
export function dbIdentity(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/-pooler(?=\.)/, ""); // Neon pooled/direct bir xil baza
    const db = decodeURIComponent(u.pathname.replace(/^\//, ""));
    return `${host}:${u.port || "5432"}/${db}`;
  } catch {
    return null;
  }
}

export function isSameDatabase(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = dbIdentity(a);
  const y = dbIdentity(b);
  return !!x && !!y && x === y;
}

/** Parolni yashirib, xato matnini xavfsiz qiladi. */
export function redact(msg: string): string {
  return msg.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgresql://***").slice(0, 500);
}

export type RetentionPlan = { keepIds: string[]; deleteIds: string[] };

/**
 * Saqlash siyosati:
 *  - eng yangi yaroqli (SUCCESS + tekshirilgan) zaxira HECH QACHON o'chirilmaydi;
 *  - kunlik zaxiralardan faqat eng yangi 7 tasi qoladi (bugungisi har doim ichida);
 *  - qo'lda / tiklashdan oldingi zaxiralar 7 kun saqlanadi;
 *  - xatolik qaydlari 7 kundan keyin, to'xtab qolgan urinishlar 30 daqiqadan keyin tozalanadi.
 */
export function planRetention(rows: RetentionRow[], now: Date): RetentionPlan {
  const byNewest = (a: RetentionRow, b: RetentionRow) => b.createdAt.getTime() - a.createdAt.getTime();
  const valid = rows.filter((r) => r.status === "SUCCESS" && r.verified).sort(byNewest);
  const keep = new Set<string>();

  if (valid[0]) keep.add(valid[0].id);

  valid
    .filter((r) => r.kind === "DAILY")
    .sort((a, b) => (b.runDate ?? "").localeCompare(a.runDate ?? "") || byNewest(a, b))
    .slice(0, DAILY_KEEP)
    .forEach((r) => keep.add(r.id));

  const cutoff = now.getTime() - RETENTION_DAYS * 86400000;
  valid.filter((r) => r.kind !== "DAILY" && r.createdAt.getTime() >= cutoff).forEach((r) => keep.add(r.id));

  const deleteIds: string[] = [];
  for (const r of rows) {
    if (keep.has(r.id)) continue;
    const age = now.getTime() - r.createdAt.getTime();
    if (r.status === "SUCCESS" && r.verified) deleteIds.push(r.id);
    else if (r.status === "FAILED") {
      if (age > FAILED_KEEP_DAYS * 86400000) deleteIds.push(r.id);
    } else if (r.status === "SUCCESS" && !r.verified) {
      if (age > 86400000) deleteIds.push(r.id); // tekshirilmagan — yaroqsiz
    } else if (age > STALE_RUN_MS) deleteIds.push(r.id); // PENDING/VERIFYING to'xtab qolgan
  }

  // Himoya: o'chirishdan keyin kamida bitta yaroqli zaxira qolishi shart
  const remainingValid = valid.filter((r) => !deleteIds.includes(r.id));
  if (valid.length > 0 && remainingValid.length === 0) {
    return { keepIds: rows.map((r) => r.id), deleteIds: [] };
  }
  return { keepIds: rows.filter((r) => !deleteIds.includes(r.id)).map((r) => r.id), deleteIds };
}

/** Qo'lda o'chirishga ruxsat: yagona yaroqli yoki bugungi kunlik zaxirani o'chirib bo'lmaydi. */
export function canDeleteManually(target: RetentionRow, all: RetentionRow[], today: string): { ok: boolean; reason?: string } {
  const valid = all.filter((r) => r.status === "SUCCESS" && r.verified);
  if (target.status === "SUCCESS" && target.verified) {
    if (valid.length <= 1) return { ok: false, reason: "Yagona yaroqli zaxirani o'chirib bo'lmaydi" };
    if (target.kind === "DAILY" && target.runDate === today) return { ok: false, reason: "Bugungi kunlik zaxirani o'chirib bo'lmaydi" };
  }
  if (target.status === "PENDING" || target.status === "VERIFYING") {
    if (Date.now() - target.createdAt.getTime() < STALE_RUN_MS) return { ok: false, reason: "Zaxira hozir yaratilmoqda" };
  }
  return { ok: true };
}

export function backupFileName(kind: BackupKind, at: Date, id: string): string {
  const stamp = at.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `ninebee-${kind.toLowerCase().replace("_", "-")}-${stamp}-${id.slice(-6)}.json.gz`;
}
