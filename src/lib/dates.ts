import { env } from "./env";

/**
 * Sana-only maydonlar (`@db.Date`) UTC yarim tun sifatida saqlanadi va "YYYY-MM-DD" ko'rinishida uzatiladi.
 * "Bugun" doimo APP_TIMEZONE bo'yicha hisoblanadi (server UTC da bo'lsa ham).
 */
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayString(s: unknown): s is string {
  if (typeof s !== "string" || !DAY_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseDay(s: string): Date {
  if (!isDayString(s)) throw new Error(`Noto'g'ri sana: ${s}`);
  return new Date(s + "T00:00:00.000Z");
}

export function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayStr(now: Date = new Date(), tz: string = env.timezone): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function today(): Date {
  return parseDay(todayStr());
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** APP_TIMEZONE dagi hozirgi sana, hafta kuni (Dushanba=1…Yakshanba=7) va vaqt. */
export function localParts(now: Date = new Date(), tz: string = env.timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hh = Number(get("hour"));
  const mm = Number(get("minute"));
  return {
    date: todayStr(now, tz),
    weekday: WEEKDAYS[get("weekday")] ?? 1,
    time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    minutes: hh * 60 + mm,
  };
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

export function addDaysStr(s: string, n: number): string {
  return fmtDay(addDays(parseDay(s), n));
}

/** "YYYY-MM" → [boshi, keyingi oy boshi) */
export function monthRange(ym: string): { from: Date; to: Date } {
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error("Noto'g'ri oy");
  const [y, m] = ym.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

export function monthStr(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function previousMonth(ym: string): string {
  const { from } = monthRange(ym);
  return monthStr(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1)));
}

/** Haftaning dushanbasi (UTC sana sifatida) */
export function startOfWeek(d: Date): Date {
  const wd = (d.getUTCDay() + 6) % 7; // Mon=0
  return addDays(d, -wd);
}

export function eachDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(fmtDay(d));
  return out;
}
