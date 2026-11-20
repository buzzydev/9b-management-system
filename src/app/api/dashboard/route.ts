import { prisma, getClass, getSystemSettings } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { CLASS_LOG_CATEGORIES } from "@/lib/permissions";
import { dayString } from "@/lib/validators";
import { addDaysStr, eachDay, fmtDay, localParts, monthStr, parseDay, startOfWeek, todayStr } from "@/lib/dates";
import { attendanceRate, emptyCounts, type Counts } from "@/lib/stats";
import { currentAndNext } from "@/lib/timetable";

function toCounts(rows: { status: keyof Counts; _count: { _all: number } }[]): Counts {
  const c = emptyCounts();
  for (const r of rows) c[r.status] += r._count._all;
  return c;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export const GET = route({ cap: "class.manage", guest: true }, async ({ query, session }) => {
  const guest = session.role === "GUEST"; // mehmon: shaxsiy ma'lumotli vidjetlar bo'sh qaytadi
  const cls = await getClass();
  const now = new Date();
  const today = todayStr(now);
  const local = localParts(now);

  const toRaw = query.get("to") || today;
  const fromRaw = query.get("from") || addDaysStr(toRaw, -29);
  const parsedTo = dayString.safeParse(toRaw);
  const parsedFrom = dayString.safeParse(fromRaw);
  if (!parsedTo.success || !parsedFrom.success) throw new HttpError(400, "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
  const from = parsedFrom.data;
  const to = parsedTo.data;
  if (from > to) throw new HttpError(400, "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas");
  if ((parseDay(to).getTime() - parseDay(from).getTime()) / 86400000 > 400) throw new HttpError(400, "Davr 400 kundan oshmasligi kerak");

  const range = { gte: parseDay(from), lte: parseDay(to) };
  const activeWhere = { classId: cls.id, status: "ACTIVE" as const };
  const activeAtt = { student: activeWhere };

  const weekStart = fmtDay(startOfWeek(parseDay(today)));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));
  const thisMonth = today.slice(0, 7);
  const months: string[] = [];
  {
    let y = Number(thisMonth.slice(0, 4));
    let m = Number(thisMonth.slice(5, 7));
    for (let i = 0; i < 6; i++) {
      months.unshift(`${y}-${String(m).padStart(2, "0")}`);
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
  }
  const monthsFrom = parseDay(months[0] + "-01");
  const monthsTo = parseDay(today);

  const [
    settings,
    students,
    todayGroups,
    rangeGroups,
    weekRows,
    monthRows,
    perStudentAtt,
    examCount,
    upcomingExamsRaw,
    slots,
    announcements,
    activity,
    deadlineEvents,
  ] = await Promise.all([
    getSystemSettings(),
    prisma.student.findMany({ where: activeWhere, select: { id: true, fullName: true, studentCode: true, photoUrl: true } }),
    prisma.attendance.groupBy({ by: ["status"], where: { date: parseDay(today), ...activeAtt }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ["status"], where: { date: range, ...activeAtt }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ["date", "status"], where: { date: { gte: parseDay(weekDays[0]), lte: parseDay(weekDays[6]) }, ...activeAtt }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ["date", "status"], where: { date: { gte: monthsFrom, lte: monthsTo }, ...activeAtt }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ["studentId", "status"], where: { date: range, ...activeAtt }, _count: { _all: true } }),
    prisma.calendarEvent.count({ where: { type: { in: ["EXAM", "TEST"] }, startsAt: { gte: now } } }),
    prisma.calendarEvent.findMany({ where: { type: { in: ["EXAM", "TEST"] }, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 5, select: { id: true, title: true, type: true, startsAt: true, allDay: true } }),
    prisma.timetable.findMany({ where: { classId: cls.id, weekday: local.weekday }, orderBy: { lessonNumber: "asc" }, include: { subject: { select: { name: true, shortName: true } } } }),
    prisma.announcement.findMany({ where: { publishAt: { lte: now } }, orderBy: [{ pinned: "desc" }, { publishAt: "desc" }], take: 5, select: { id: true, title: true, body: true, priority: true, pinned: true, publishAt: true } }),
    prisma.activityLog.findMany({
      where: session.role === "ADMIN" ? {} : { category: { in: [...CLASS_LOG_CATEGORIES] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, userName: true, action: true, category: true, description: true, createdAt: true },
    }),
    prisma.calendarEvent.findMany({ where: { type: "DEADLINE", startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 5, select: { id: true, title: true, startsAt: true } }),
  ]);

  // ---- Statistika ----
  const today_ = toCounts(todayGroups);
  const marked = today_.PRESENT + today_.ABSENT + today_.LATE + today_.EXCUSED + today_.ESCAPED;
  const rangeCounts = toCounts(rangeGroups);
  const activeCount = students.length;

  // ---- Grafiklar ----
  const byDate = (rows: { date: Date; status: keyof Counts; _count: { _all: number } }[]) => {
    const m = new Map<string, Counts>();
    for (const r of rows) {
      const k = fmtDay(r.date);
      const c = m.get(k) ?? emptyCounts();
      c[r.status] += r._count._all;
      m.set(k, c);
    }
    return m;
  };
  const weekMap = byDate(weekRows);
  const weekly = weekDays.map((d) => {
    const c = weekMap.get(d) ?? emptyCounts();
    return { date: d, PRESENT: c.PRESENT, LATE: c.LATE, ABSENT: c.ABSENT, EXCUSED: c.EXCUSED, ESCAPED: c.ESCAPED };
  });

  const monthAgg = new Map<string, Counts>(months.map((m) => [m, emptyCounts()]));
  for (const [d, c] of byDate(monthRows)) {
    const agg = monthAgg.get(monthStr(parseDay(d)));
    if (agg) (Object.keys(c) as (keyof Counts)[]).forEach((k) => (agg[k] += c[k]));
  }
  const monthly = months.map((m) => ({ month: m, rate: attendanceRate(monthAgg.get(m)!) }));

  const distribution = [
    { status: "PRESENT", count: rangeCounts.PRESENT },
    { status: "LATE", count: rangeCounts.LATE },
    { status: "ABSENT", count: rangeCounts.ABSENT },
    { status: "EXCUSED", count: rangeCounts.EXCUSED },
    { status: "ESCAPED", count: rangeCounts.ESCAPED },
  ];

  // ---- Vidjetlar ----
  const nowSlots = currentAndNext(slots, local.minutes);
  const todayTimetable = {
    weekday: local.weekday,
    currentId: nowSlots.current?.id ?? null,
    nextId: nowSlots.next?.id ?? null,
    lessons: slots.map((s) => ({ id: s.id, lessonNumber: s.lessonNumber, subject: s.subject.name, teacherName: s.teacherName, room: s.room, startTime: s.startTime, endTime: s.endTime })),
  };

  // E'tibor talab qiladigan o'quvchilar (yumshoq sabablar)
  const attPer = new Map<string, Counts>();
  for (const r of perStudentAtt) {
    const c = attPer.get(r.studentId) ?? emptyCounts();
    c[r.status] += r._count._all;
    attPer.set(r.studentId, c);
  }
  const needsAttention: { id: string; fullName: string; studentCode: string; photoUrl: string | null; reasons: string[] }[] = [];
  for (const s of students) {
    const reasons: string[] = [];
    const c = attPer.get(s.id);
    if (c) {
      const days = c.PRESENT + c.ABSENT + c.LATE + c.EXCUSED + c.ESCAPED;
      const rate = attendanceRate(c);
      if (days >= 3 && rate != null && rate < settings.attendanceAlertPercent) reasons.push(`Davomatga e'tibor kerak (${Math.round(rate)}%)`);
    }
    if (reasons.length) needsAttention.push({ id: s.id, fullName: s.fullName, studentCode: s.studentCode, photoUrl: s.photoUrl, reasons });
  }
  needsAttention.sort((a, b) => b.reasons.length - a.reasons.length || a.fullName.localeCompare(b.fullName));

  const upcomingDeadlines = [
    ...deadlineEvents.map((e) => ({ id: `ev-${e.id}`, kind: "event" as const, title: e.title, subject: null as string | null, at: e.startsAt, completed: null as number | null, total: null as number | null, link: `/calendar` })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 5);

  return {
    range: { from, to },
    today,
    stats: {
      totalStudents: activeCount,
      presentToday: today_.PRESENT,
      absentToday: today_.ABSENT,
      lateToday: today_.LATE,
      excusedToday: today_.EXCUSED,
      escapedToday: today_.ESCAPED,
      notMarkedToday: Math.max(0, activeCount - marked),
      averageAttendance: attendanceRate(rangeCounts),
      upcomingExams: examCount,
    },
    charts: { weekly, monthly, distribution },
    widgets: {
      todayTimetable,
      upcomingExams: upcomingExamsRaw,
      recentAnnouncements: announcements.map((a) => ({ id: a.id, title: a.title, excerpt: cut(a.body, 120), priority: a.priority, pinned: a.pinned, publishAt: a.publishAt })),
      recentActivity: guest ? [] : activity,
      needsAttention: guest ? [] : needsAttention.slice(0, 8),
      upcomingDeadlines,
    },
    scale: { attendanceAlertPercent: settings.attendanceAlertPercent },
  };
});
