import { env } from "@/lib/env";
import { addDaysStr } from "@/lib/dates";

function offsetMs(at: Date, tz: string): number {
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

/** "YYYY-MM-DD" kunining APP_TIMEZONE bo'yicha boshlanish onini (UTC Date) qaytaradi. */
export function dayStartUtc(day: string, tz: string = env.timezone): Date {
  const guess = new Date(day + "T00:00:00.000Z");
  return new Date(guess.getTime() - offsetMs(guess, tz));
}

/** Kun oralig'i [from, to] (inklyuziv) uchun [start, endExclusive) UTC chegaralari. */
export function dayRangeUtc(from: string, to: string) {
  return { gte: dayStartUtc(from), lt: dayStartUtc(addDaysStr(to, 1)) };
}
