// Faqat server: navbatchilik tizimi (avtomatik tayinlash, tarix, qo'lda boshqarish).
// Barcha yozuvlar bitta PostgreSQL advisory lock ostida bajariladi, (sana, slot) noyob — kun ichida takror tayinlash mumkin emas.
import { Prisma, type DutyStatus } from "@prisma/client";
import { prisma, getClass } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { addDaysStr, fmtDay, parseDay, todayStr } from "@/lib/dates";
import {
  DEFAULT_WEEKDAYS,
  DUTY_PER_DAY,
  DUTY_TASKS,
  alphabeticalOrder,
  canReplace,
  dutyDaysBetween,
  effectiveCounts,
  isDutyDay,
  nextDutyDays,
  pickNext,
  progress as calcProgress,
  simulate,
  type DutyMemberLite,
} from "@/lib/duty";

type Tx = Prisma.TransactionClient;
const LOCK_KEY = 9_000_117;
const TX_OPTS = { timeout: 20_000, maxWait: 10_000 } as const;

export type DutyActor = { id: string; fullName: string };

async function lock(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY}::bigint)`;
}

async function loadSettings(tx: Tx) {
  return tx.dutySettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", weekdays: DEFAULT_WEEKDAYS } });
}

type MemberRow = { studentId: string; position: number; baseline: number; enabled: boolean; fullName: string; photoUrl: string | null; studentCode: string };

/** Faol o'quvchilar bilan navbat ro'yxatini moslashtiradi: yangi o'quvchi qo'shiladi, arxivlanganlar chiqariladi. */
async function syncMembers(tx: Tx, classId: string): Promise<MemberRow[]> {
  const [students, members] = await Promise.all([
    tx.student.findMany({ where: { classId }, select: { id: true, fullName: true, photoUrl: true, studentCode: true, status: true } }),
    tx.dutyMember.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);
  const byStudent = new Map(members.map((m) => [m.studentId, m]));
  const stuMap = new Map(students.map((s) => [s.id, s]));
  const active = students.filter((s) => s.status === "ACTIVE");

  // Hisoblar (adolat uchun yangi / qaytgan o'quvchilarni mavjud aylanishga tenglash)
  const turnRows = await tx.dutyAssignment.groupBy({ by: ["studentId"], where: { status: { not: "MISSED" }, studentId: { not: null } }, _count: { _all: true } });
  const turnCount = new Map(turnRows.map((r) => [r.studentId as string, r._count._all]));
  const enabledNow = members.filter((m) => m.enabled && stuMap.get(m.studentId)?.status === "ACTIVE");
  const effOf = (m: { studentId: string; baseline: number }) => m.baseline + (turnCount.get(m.studentId) ?? 0);
  const currentMin = enabledNow.length ? Math.min(...enabledNow.map(effOf)) : 0;

  // 1) Yangi o'quvchilar — alifbo bo'yicha tegishli joyga qo'yiladi
  const fresh = active.filter((s) => !byStudent.has(s.id));
  let order = members.map((m) => ({ id: m.studentId, name: stuMap.get(m.studentId)?.fullName ?? "" }));
  const added: { studentId: string; baseline: number }[] = [];
  if (fresh.length) {
    const cmpIds = alphabeticalOrder([...order, ...fresh.map((s) => ({ id: s.id, name: s.fullName }))]);
    // mavjud (administrator belgilagan) tartibni saqlab, yangilarni alifbo bo'yicha eng yaqin joyga kiritamiz
    const nameOf = new Map<string, string>([...order.map((o) => [o.id, o.name] as [string, string]), ...fresh.map((s) => [s.id, s.fullName] as [string, string])]);
    const rank = new Map(cmpIds.map((id, i) => [id, i]));
    const result = [...order];
    for (const s of fresh) {
      let idx = result.findIndex((o) => (rank.get(o.id) ?? 0) > (rank.get(s.id) ?? 0));
      if (idx === -1) idx = result.length;
      result.splice(idx, 0, { id: s.id, name: nameOf.get(s.id) ?? s.fullName });
      added.push({ studentId: s.id, baseline: currentMin });
    }
    order = result;
  }
  if (added.length) {
    await tx.dutyMember.createMany({ data: added.map((a, i) => ({ studentId: a.studentId, position: 1_000_000 + i, baseline: a.baseline })), skipDuplicates: true });
  }

  // 2) Arxivlangan -> avtomatik o'chirish; qaytarilgan -> avtomatik yoqish (baseline bilan tenglash)
  for (const m of members) {
    const st = stuMap.get(m.studentId)?.status;
    if (st !== "ACTIVE" && m.enabled) {
      await tx.dutyMember.update({ where: { studentId: m.studentId }, data: { enabled: false, autoDisabled: true } });
    } else if (st === "ACTIVE" && !m.enabled && m.autoDisabled) {
      const cnt = effOf(m);
      await tx.dutyMember.update({ where: { studentId: m.studentId }, data: { enabled: true, autoDisabled: false, baseline: m.baseline + Math.max(0, currentMin - cnt) } });
    }
  }

  // 3) Pozitsiyalarni 0..n-1 ga qayta raqamlash (faqat o'zgargan bo'lsa)
  if (added.length) {
    for (let i = 0; i < order.length; i++) await tx.dutyMember.update({ where: { studentId: order[i].id }, data: { position: i } });
  }

  const rows = await tx.dutyMember.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { student: { select: { fullName: true, photoUrl: true, studentCode: true, status: true } } } });
  return rows
    .filter((m) => m.student.status === "ACTIVE" || m.enabled)
    .map((m) => ({ studentId: m.studentId, position: m.position, baseline: m.baseline, enabled: m.enabled, fullName: m.student.fullName, photoUrl: m.student.photoUrl, studentCode: m.student.studentCode }));
}

const lite = (rows: MemberRow[]): DutyMemberLite[] => rows.map((r) => ({ id: r.studentId, name: r.fullName, position: r.position, baseline: r.baseline, enabled: r.enabled }));

async function currentCounts(tx: Tx, members: DutyMemberLite[]) {
  const rows = await tx.dutyAssignment.groupBy({ by: ["studentId"], where: { status: { not: "MISSED" }, studentId: { not: null } }, _count: { _all: true } });
  const turns = rows.flatMap((r) => Array.from({ length: r._count._all }, () => ({ memberId: r.studentId as string, status: "ASSIGNED" as const })));
  return effectiveCounts(members, turns);
}

/**
 * Sana o'zgarganda (yoki server uzoq turib qolgan bo'lsa) yetishmayotgan kunlar uchun navbatchilarni tayinlaydi.
 * Idempotent: bir xil sanada qayta chaqirilsa hech narsa o'zgarmaydi.
 */
async function ensureGeneratedTx(tx: Tx, classId: string, today: string) {
  await lock(tx);
  const settings = await loadSettings(tx);
  const startedOn = settings.startedOn ? fmtDay(settings.startedOn) : today;
  if (!settings.startedOn) await tx.dutySettings.update({ where: { id: "singleton" }, data: { startedOn: parseDay(today) } });

  const rows = await syncMembers(tx, classId);
  const members = lite(rows);
  const counts = await currentCounts(tx, members);

  const last = await tx.dutyAssignment.aggregate({ _max: { date: true } });
  const lastDay = last._max.date ? fmtDay(last._max.date) : null;
  const after = lastDay && lastDay >= startedOn ? lastDay : addDaysStr(startedOn, -1);
  const days = dutyDaysBetween(after, today, settings.weekdays);

  const names = new Map(rows.map((r) => [r.studentId, r.fullName]));
  const toCreate: Prisma.DutyAssignmentCreateManyInput[] = [];
  for (const day of days) {
    const picked = pickNext(members, counts, DUTY_PER_DAY);
    picked.forEach((id, i) => {
      toCreate.push({ date: parseDay(day), slot: i + 1, studentId: id, studentName: names.get(id) ?? "—" });
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
  }

  // Bugun uchun bo'sh qolgan slotlar (masalan, avval o'quvchi yetmagan bo'lsa)
  if (isDutyDay(today, settings.weekdays) && !days.includes(today)) {
    const existing = await tx.dutyAssignment.findMany({ where: { date: parseDay(today) }, select: { slot: true, studentId: true } });
    if (existing.length && existing.length < DUTY_PER_DAY) {
      const busy = new Set(existing.map((e) => e.studentId).filter(Boolean) as string[]);
      const free = pickNext(members, counts, DUTY_PER_DAY - existing.length, busy);
      const usedSlots = new Set(existing.map((e) => e.slot));
      for (const id of free) {
        let slot = 1;
        while (usedSlots.has(slot)) slot++;
        usedSlots.add(slot);
        toCreate.push({ date: parseDay(today), slot, studentId: id, studentName: names.get(id) ?? "—" });
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }

  if (toCreate.length) await tx.dutyAssignment.createMany({ data: toCreate, skipDuplicates: true });
  return { settings, rows };
}

export async function ensureGenerated() {
  const cls = await getClass();
  const today = todayStr();
  const { settings, rows } = await prisma.$transaction((tx) => ensureGeneratedTx(tx, cls.id, today), TX_OPTS);
  return { today, settings, rows };
}

export type DutyPerson = { studentId: string; name: string; photoUrl: string | null };

export async function getOverview() {
  const { today, settings, rows } = await ensureGenerated();
  const members = lite(rows);
  const info = new Map(rows.map((r) => [r.studentId, r]));
  const person = (id: string): DutyPerson => ({ studentId: id, name: info.get(id)?.fullName ?? "—", photoUrl: info.get(id)?.photoUrl ?? null });

  const [todayRows, counts, lastDoneRow, totalAssignments] = await Promise.all([
    prisma.dutyAssignment.findMany({ where: { date: parseDay(today) }, orderBy: { slot: "asc" }, include: { student: { select: { photoUrl: true } } } }),
    prisma.$transaction((tx) => currentCounts(tx, members)),
    prisma.dutyAssignment.findFirst({ where: { status: "DONE" }, orderBy: [{ date: "desc" }, { slot: "asc" }], select: { date: true } }),
    prisma.dutyAssignment.count(),
  ]);

  const prog = calcProgress(members, counts);
  const sim = simulate(members, counts, 6);
  const futureDays = nextDutyDays(addDaysStr(today, 1), settings.weekdays, 6);
  const upcoming = futureDays.map((date, i) => ({ date, students: (sim[i] ?? []).map(person) }));
  const tomorrowStr = addDaysStr(today, 1);

  const todayDuty = todayRows.map((r) => ({
    id: r.id,
    slot: r.slot,
    studentId: r.studentId,
    name: r.studentName,
    photoUrl: r.student?.photoUrl ?? null,
    status: r.status,
    manual: r.manual,
    replacedName: r.replacedName,
    markedByName: r.markedByName,
    markedAt: r.markedAt,
  }));

  const todayIds = new Set(todayRows.map((r) => r.studentId).filter(Boolean) as string[]);
  const queue = rows.map((r) => {
    const c = counts.get(r.studentId) ?? 0;
    const state = !r.enabled ? "disabled" : todayIds.has(r.studentId) ? "today" : prog.pendingIds.includes(r.studentId) ? "pending" : "served";
    return { studentId: r.studentId, name: r.fullName, photoUrl: r.photoUrl, studentCode: r.studentCode, position: r.position, enabled: r.enabled, count: c, state };
  });
  const pendingOrder = new Map(prog.pendingIds.map((id, i) => [id, i + 1]));

  return {
    today,
    isDutyDay: isDutyDay(today, settings.weekdays),
    tasks: [...DUTY_TASKS],
    todayDuty,
    next: upcoming[0] ? { ...upcoming[0], isTomorrow: upcoming[0].date === tomorrowStr } : null,
    upcoming: upcoming.slice(1),
    pending: prog.pendingIds.map((id) => ({ ...person(id), order: pendingOrder.get(id) ?? 0, isToday: todayIds.has(id) })),
    served: prog.servedIds.map(person),
    progress: { percent: prog.percent, completedRounds: prog.completedRounds, active: prog.active, served: prog.servedIds.length, pending: prog.pendingIds.length },
    queue,
    settings: { weekdays: settings.weekdays },
    stats: { totalAssignments, lastDoneDate: lastDoneRow ? fmtDay(lastDoneRow.date) : null },
  };
}

export async function getHistory(opts: { skip: number; take: number; studentId?: string | null; status?: DutyStatus | null }) {
  await ensureGenerated();
  const where: Prisma.DutyAssignmentWhereInput = { ...(opts.studentId ? { studentId: opts.studentId } : {}), ...(opts.status ? { status: opts.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.dutyAssignment.findMany({ where, orderBy: [{ date: "desc" }, { slot: "asc" }], skip: opts.skip, take: opts.take, include: { student: { select: { photoUrl: true } } } }),
    prisma.dutyAssignment.count({ where }),
  ]);
  return {
    items: items.map((r) => ({
      id: r.id,
      date: fmtDay(r.date),
      slot: r.slot,
      studentId: r.studentId,
      name: r.studentName,
      photoUrl: r.student?.photoUrl ?? null,
      status: r.status,
      manual: r.manual,
      replacedName: r.replacedName,
      markedByName: r.markedByName,
      markedAt: r.markedAt,
    })),
    total,
  };
}

export async function setStatus(id: string, status: DutyStatus, actor: DutyActor) {
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const a = await tx.dutyAssignment.findUnique({ where: { id } });
    if (!a) throw new HttpError(404, "Navbatchilik yozuvi topilmadi");
    const upd = await tx.dutyAssignment.update({
      where: { id },
      data: { status, markedById: status === "ASSIGNED" ? null : actor.id, markedByName: status === "ASSIGNED" ? null : actor.fullName, markedAt: status === "ASSIGNED" ? null : new Date() },
    });
    return { before: a, after: upd };
  }, TX_OPTS);
}

/** Bugungi navbatchini boshqa (adolatli tanlangan) o'quvchiga qo'lda almashtirish. */
export async function replaceAssignment(id: string, newStudentId: string, actor: DutyActor, note?: string | null) {
  const cls = await getClass();
  const today = todayStr();
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const a = await tx.dutyAssignment.findUnique({ where: { id } });
    if (!a) throw new HttpError(404, "Navbatchilik yozuvi topilmadi");
    if (fmtDay(a.date) !== today) throw new HttpError(400, "Faqat bugungi navbatchini almashtirish mumkin. O'tgan kunlar tarixi o'zgarmaydi.");
    if (a.studentId === newStudentId) throw new HttpError(400, "Bu o'quvchi allaqachon navbatchi");
    const rows = await syncMembers(tx, cls.id);
    const members = lite(rows);
    const counts = await currentCounts(tx, members);
    const sameDay = await tx.dutyAssignment.findMany({ where: { date: a.date }, select: { studentId: true } });
    const busy = new Set(sameDay.map((s) => s.studentId).filter(Boolean) as string[]);
    const verdict = canReplace(members, counts, { memberId: a.studentId, countsTowardRotation: a.status !== "MISSED" }, newStudentId, busy);
    if (!verdict.ok) throw new HttpError(409, verdict.reason);
    const next = rows.find((r) => r.studentId === newStudentId)!;
    const upd = await tx.dutyAssignment.update({
      where: { id },
      data: {
        studentId: newStudentId,
        studentName: next.fullName,
        status: "ASSIGNED",
        manual: true,
        replacedName: a.replacedName ?? a.studentName,
        note: note ?? a.note,
        markedById: actor.id,
        markedByName: actor.fullName,
        markedAt: new Date(),
      },
    });
    return { before: a, after: upd };
  }, TX_OPTS);
}

/** Bugungi navbatchi o'rniga qo'yish mumkin bo'lgan (adolatli) o'quvchilar ro'yxati */
export async function replacementCandidates(id: string) {
  const cls = await getClass();
  return prisma.$transaction(async (tx) => {
    const a = await tx.dutyAssignment.findUnique({ where: { id } });
    if (!a) throw new HttpError(404, "Navbatchilik yozuvi topilmadi");
    const rows = await syncMembers(tx, cls.id);
    const members = lite(rows);
    const counts = await currentCounts(tx, members);
    const sameDay = await tx.dutyAssignment.findMany({ where: { date: a.date }, select: { studentId: true } });
    const busy = new Set(sameDay.map((s) => s.studentId).filter(Boolean) as string[]);
    return rows
      .filter((r) => r.enabled && canReplace(members, counts, { memberId: a.studentId, countsTowardRotation: a.status !== "MISSED" }, r.studentId, busy).ok)
      .map((r) => ({ studentId: r.studentId, name: r.fullName, photoUrl: r.photoUrl }));
  }, TX_OPTS);
}

export async function setOrder(studentIds: string[]) {
  const cls = await getClass();
  await prisma.$transaction(async (tx) => {
    await lock(tx);
    const rows = await syncMembers(tx, cls.id);
    const all = new Set(rows.map((r) => r.studentId));
    if (studentIds.length !== all.size || new Set(studentIds).size !== studentIds.length || studentIds.some((s) => !all.has(s))) {
      throw new HttpError(400, "Tartib ro'yxati joriy navbat ro'yxatiga mos kelmadi. Sahifani yangilab qayta urinib ko'ring.");
    }
    for (let i = 0; i < studentIds.length; i++) await tx.dutyMember.update({ where: { studentId: studentIds[i] }, data: { position: i } });
  }, TX_OPTS);
}

export async function resetAlphabetical() {
  const cls = await getClass();
  await prisma.$transaction(async (tx) => {
    await lock(tx);
    const rows = await syncMembers(tx, cls.id);
    const ids = alphabeticalOrder(rows.map((r) => ({ id: r.studentId, name: r.fullName })));
    for (let i = 0; i < ids.length; i++) await tx.dutyMember.update({ where: { studentId: ids[i] }, data: { position: i } });
  }, TX_OPTS);
}

/** O'quvchini navbatchilikdan vaqtincha chiqarish / qaytarish. Qaytganda hisobi joriy aylanishga tenglanadi (ortiqcha ketma-ket navbat bermaslik uchun). */
export async function setEnabled(studentId: string, enabled: boolean) {
  const cls = await getClass();
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const rows = await syncMembers(tx, cls.id);
    const row = rows.find((r) => r.studentId === studentId);
    if (!row) throw new HttpError(404, "O'quvchi navbat ro'yxatida topilmadi");
    if (row.enabled === enabled) return row;
    if (enabled) {
      const members = lite(rows);
      const counts = await currentCounts(tx, members);
      const act = members.filter((m) => m.enabled);
      const min = act.length ? Math.min(...act.map((m) => counts.get(m.id) ?? 0)) : 0;
      const mine = counts.get(studentId) ?? 0;
      await tx.dutyMember.update({ where: { studentId }, data: { enabled: true, autoDisabled: false, baseline: row.baseline + Math.max(0, min - mine) } });
    } else {
      await tx.dutyMember.update({ where: { studentId }, data: { enabled: false, autoDisabled: false } });
    }
    return row;
  }, TX_OPTS);
}

export async function setWeekdays(weekdays: number[]) {
  await prisma.dutySettings.upsert({ where: { id: "singleton" }, update: { weekdays }, create: { id: "singleton", weekdays } });
}

/** O'quvchi profili uchun: shu o'quvchining navbatchilik tarixi */
export async function studentDuty(studentId: string) {
  const rows = await prisma.dutyAssignment.findMany({ where: { studentId }, orderBy: [{ date: "desc" }, { slot: "asc" }], take: 100 });
  const count = await prisma.dutyAssignment.count({ where: { studentId, status: { not: "MISSED" } } });
  return { count, items: rows.map((r) => ({ id: r.id, date: fmtDay(r.date), status: r.status, manual: r.manual })) };
}

/** Mehmonga o'quvchi rasmlari yuborilmaydi (maxfiylik) */
export function stripPhotos<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (k, v) => (k === "photoUrl" ? null : v)));
}
