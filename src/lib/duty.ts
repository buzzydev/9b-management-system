// Navbatchilik algoritmi — sof funksiyalar (bazaga bog'liq emas), shuning uchun to'liq test qilinadi.
//
// Adolat qoidasi (hisob asosida):
//   hisob(o'quvchi) = baseline + (MISSED bo'lmagan tayinlashlar soni)
//   Har kuni DUTY_PER_DAY ta o'quvchi tanlanadi: eng kam hisobli, teng bo'lsa — navbat tartibi (position) bo'yicha.
//   Natijada hech kim boshqalar hammasi navbatchi bo'lmaguncha ikkinchi marta tanlanmaydi,
//   aylanish tugagach (hamma teng bo'lganda) navbat avtomatik ro'yxat boshidan boshlanadi.
//   Qo'lda almashtirish, yangi o'quvchi, arxivlangan o'quvchi — barchasi shu hisob orqali adolatli qoladi.

export const DUTY_PER_DAY = 2;
export const DUTY_TASKS = ["Bo'r olib kelish", "Doskani artish"] as const;
export const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5, 6];

export type DutyMemberLite = {
  id: string;
  name: string;
  position: number;
  baseline: number;
  enabled: boolean;
};

export type DutyTurn = { memberId: string | null; status: "ASSIGNED" | "DONE" | "MISSED" };

/** Alifbo bo'yicha solishtirish (o'zbek lotin alifbosi; ICU bo'lmasa standart tartib) */
export function nameCollator(): (a: string, b: string) => number {
  let c: Intl.Collator;
  try {
    c = new Intl.Collator("uz", { sensitivity: "base", numeric: true });
  } catch {
    c = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }
  return (a, b) => c.compare(a.replace(/[ʻʼ`’‘]/g, "'"), b.replace(/[ʻʼ`’‘]/g, "'"));
}

/** Alifbo tartibidagi pozitsiyalar (0,1,2…) */
export function alphabeticalOrder<T extends { id: string; name: string }>(items: T[]): string[] {
  const cmp = nameCollator();
  return [...items].sort((a, b) => cmp(a.name, b.name) || a.id.localeCompare(b.id)).map((i) => i.id);
}

/** Har bir a'zoning joriy hisobi: baseline + MISSED bo'lmagan tayinlashlar */
export function effectiveCounts(members: DutyMemberLite[], turns: DutyTurn[]): Map<string, number> {
  const m = new Map(members.map((x) => [x.id, x.baseline]));
  for (const t of turns) {
    if (!t.memberId || t.status === "MISSED") continue;
    if (m.has(t.memberId)) m.set(t.memberId, (m.get(t.memberId) ?? 0) + 1);
  }
  return m;
}

const byQueue = (counts: Map<string, number>) => (a: DutyMemberLite, b: DutyMemberLite) =>
  (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || a.position - b.position || a.id.localeCompare(b.id);

/** Keyingi `n` ta navbatchini tanlaydi (counts o'zgartirilmaydi). `exclude` — shu kuni allaqachon band bo'lganlar. */
export function pickNext(members: DutyMemberLite[], counts: Map<string, number>, n = DUTY_PER_DAY, exclude: Set<string> = new Set()): string[] {
  return members
    .filter((m) => m.enabled && !exclude.has(m.id))
    .sort(byQueue(counts))
    .slice(0, n)
    .map((m) => m.id);
}

/** Bir nechta kelgusi kun uchun ketma-ket (hisobni oshirib borib) oldindan ko'rish. Bazaga yozilmaydi. */
export function simulate(members: DutyMemberLite[], counts: Map<string, number>, days: number, n = DUTY_PER_DAY): string[][] {
  const c = new Map(counts);
  const out: string[][] = [];
  for (let i = 0; i < days; i++) {
    const picked = pickNext(members, c, n);
    for (const id of picked) c.set(id, (c.get(id) ?? 0) + 1);
    out.push(picked);
  }
  return out;
}

export type Progress = {
  active: number;
  /** tugagan to'liq aylanishlar soni */
  completedRounds: number;
  /** joriy aylanishda navbatchi bo'lganlar */
  servedIds: string[];
  /** joriy aylanishda hali navbat kelmaganlar (navbat tartibida) */
  pendingIds: string[];
  percent: number;
};

/** Joriy aylanish: min hisobdagilar — hali navbat kelmaganlar, undan yuqorilar — shu aylanishda bajarganlar. */
export function progress(members: DutyMemberLite[], counts: Map<string, number>): Progress {
  const active = members.filter((m) => m.enabled);
  if (!active.length) return { active: 0, completedRounds: 0, servedIds: [], pendingIds: [], percent: 0 };
  const min = Math.min(...active.map((m) => counts.get(m.id) ?? 0));
  const sorted = [...active].sort(byQueue(counts));
  const pendingIds = sorted.filter((m) => (counts.get(m.id) ?? 0) === min).map((m) => m.id);
  const servedIds = sorted.filter((m) => (counts.get(m.id) ?? 0) > min).map((m) => m.id);
  const baseMin = Math.min(...active.map((m) => m.baseline));
  return {
    active: active.length,
    completedRounds: Math.max(0, min - baseMin),
    servedIds,
    pendingIds,
    percent: Math.round((servedIds.length / active.length) * 1000) / 10,
  };
}

/**
 * Qo'lda almashtirish adolatli bo'ladimi? `replacedId` o'rniga `candidateId` qo'yilganda
 * (almashtirilgan o'quvchining shu tayinlashi bekor bo'lib, hisobi 1 ga kamayadi) nomzodning hisobi
 * eng kam hisobga teng bo'lishi shart — ya'ni u hozirgi aylanishda hali navbat kelmaganlardan.
 */
export function canReplace(
  members: DutyMemberLite[],
  counts: Map<string, number>,
  replaced: { memberId: string | null; countsTowardRotation: boolean },
  candidateId: string,
  busyThatDay: Set<string>,
): { ok: true } | { ok: false; reason: string } {
  const cand = members.find((m) => m.id === candidateId);
  if (!cand) return { ok: false, reason: "O'quvchi navbat ro'yxatida topilmadi" };
  if (!cand.enabled) return { ok: false, reason: "O'quvchi navbatchilikdan chiqarilgan" };
  if (busyThatDay.has(candidateId)) return { ok: false, reason: "Bu o'quvchi shu kuni allaqachon navbatchi" };
  const c = new Map(counts);
  if (replaced.memberId && replaced.countsTowardRotation && c.has(replaced.memberId)) c.set(replaced.memberId, (c.get(replaced.memberId) ?? 0) - 1);
  const active = members.filter((m) => m.enabled);
  const min = Math.min(...active.map((m) => c.get(m.id) ?? 0));
  if ((c.get(candidateId) ?? 0) !== min) {
    return { ok: false, reason: "Bu o'quvchi shu aylanishda allaqachon navbatchi bo'lgan — adolat buzilmasligi uchun faqat hali navbat kelmaganlar tanlanadi" };
  }
  return { ok: true };
}

/** ISO hafta kuni: 1 = dushanba … 7 = yakshanba (YYYY-MM-DD uchun) */
export function isoWeekday(day: string): number {
  const d = new Date(day + "T00:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

const addDay = (day: string, n: number) => new Date(new Date(day + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

export function isDutyDay(day: string, weekdays: number[]): boolean {
  return weekdays.includes(isoWeekday(day));
}

/** `from` dan boshlab (o'zi ham kiradi) keyingi `count` ta navbatchilik kuni */
export function nextDutyDays(from: string, weekdays: number[], count: number): string[] {
  if (!weekdays.length) return [];
  const out: string[] = [];
  let d = from;
  for (let i = 0; i < 400 && out.length < count; i++) {
    if (isDutyDay(d, weekdays)) out.push(d);
    d = addDay(d, 1);
  }
  return out;
}

/** (afterExclusive, toInclusive] oralig'idagi navbatchilik kunlari — to'ldirish (backfill) uchun. Juda uzoq tanaffusda faqat oxirgi `max` ta kun olinadi. */
export function dutyDaysBetween(afterExclusive: string, toInclusive: string, weekdays: number[], max = 62): string[] {
  const out: string[] = [];
  let d = addDay(afterExclusive, 1);
  for (let i = 0; i < 800 && d <= toInclusive; i++) {
    if (isDutyDay(d, weekdays)) out.push(d);
    d = addDay(d, 1);
  }
  return out.length > max ? out.slice(out.length - max) : out;
}
