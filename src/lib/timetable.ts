// Jadval mantiqi (sof) — testlar: tests/timetable.test.ts

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export type Slot = {
  id?: string;
  weekday: number;
  lessonNumber: number;
  startTime: string;
  endTime: string;
  teacherName?: string;
  room?: string | null;
};

/** Nomzod dars mavjud darslar bilan to'qnashsa, sababini qaytaradi; aks holda null. */
export function findConflict(existing: Slot[], cand: Slot): string | null {
  if (!TIME_RE.test(cand.startTime) || !TIME_RE.test(cand.endTime)) return "Vaqt formati HH:mm bo'lishi kerak";
  const cs = timeToMin(cand.startTime);
  const ce = timeToMin(cand.endTime);
  if (ce <= cs) return "Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak";
  for (const e of existing) {
    if (e.id && e.id === cand.id) continue;
    if (e.weekday !== cand.weekday) continue;
    if (e.lessonNumber === cand.lessonNumber) return `${cand.lessonNumber}-dars bu kunda allaqachon mavjud`;
    const es = timeToMin(e.startTime);
    const ee = timeToMin(e.endTime);
    if (cs < ee && es < ce) return `Vaqt ${e.lessonNumber}-dars (${e.startTime}–${e.endTime}) bilan to'qnashadi`;
  }
  return null;
}

export type LessonState = { current: Slot | null; next: Slot | null };

/** Berilgan kun darslari ichidan hozirgi va keyingi darsni topadi. */
export function currentAndNext<T extends Slot>(daySlots: T[], nowMinutes: number): { current: T | null; next: T | null } {
  const sorted = [...daySlots].sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
  let current: T | null = null;
  let next: T | null = null;
  for (const s of sorted) {
    const st = timeToMin(s.startTime);
    const en = timeToMin(s.endTime);
    if (nowMinutes >= st && nowMinutes < en) current = s;
    else if (st > nowMinutes && !next) next = s;
  }
  return { current, next };
}
