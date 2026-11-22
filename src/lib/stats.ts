// Sof (pure) hisob-kitob funksiyalari — testlar: tests/stats.test.ts

export type AttendanceStatusKey = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "ESCAPED";
export type Counts = Record<AttendanceStatusKey, number>;

export const emptyCounts = (): Counts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, ESCAPED: 0 });

export function tally(rows: { status: AttendanceStatusKey }[]): Counts {
  const c = emptyCounts();
  for (const r of rows) c[r.status] += 1;
  return c;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Davomat foizi = (Keldi + Kechikdi) / (Keldi + Kechikdi + Kelmadi) × 100.
 * "Sababli" kunlar maxrajdan chiqariladi (sababli yo'qlik foizni tushirmaydi).
 * "Qochib ketdi" — ruxsatsiz ketish: "Kelmadi" kabi maxrajga kiradi va foizni tushiradi.
 * Hisoblash uchun ma'lumot bo'lmasa null.
 */
export function attendanceRate(c: Counts): number | null {
  const attended = c.PRESENT + c.LATE;
  const denom = attended + c.ABSENT + (c.ESCAPED ?? 0);
  if (denom === 0) return null;
  return round1((attended / denom) * 100);
}

export function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : round1((part / whole) * 100);
}
