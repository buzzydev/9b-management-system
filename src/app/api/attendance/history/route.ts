import type { Prisma } from "@prisma/client";
import { prisma, getClass } from "@/lib/db";
import { route, paging, HttpError } from "@/lib/api";
import { addDaysStr, fmtDay, isDayString, monthRange, parseDay, todayStr } from "@/lib/dates";
import { attendanceRate, emptyCounts, type AttendanceStatusKey, type Counts } from "@/lib/stats";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "ESCAPED"];

export const GET = route({ cap: "class.manage", guest: true }, async ({ query, session }) => {
  const guest = session.role === "GUEST";
  const cls = await getClass();
  const mode = query.get("mode") ?? "records";

  if (mode === "calendar") {
    const ym = query.get("month") ?? todayStr().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) throw new HttpError(400, "Oy YYYY-MM ko'rinishida bo'lishi kerak");
    const { from, to } = monthRange(ym);
    const rows = await prisma.attendance.groupBy({
      by: ["date", "status"],
      where: { classId: cls.id, date: { gte: from, lt: to } },
      _count: { _all: true },
    });
    const days = new Map<string, Counts>();
    for (const r of rows) {
      const k = fmtDay(r.date);
      if (!days.has(k)) days.set(k, emptyCounts());
      days.get(k)![r.status as AttendanceStatusKey] = r._count._all;
    }
    const totalStudents = await prisma.student.count({ where: { classId: cls.id, status: "ACTIVE" } });
    return {
      month: ym,
      totalStudents,
      days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({ date, counts, rate: attendanceRate(counts) })),
    };
  }

  const fromQ = query.get("from");
  const toQ = query.get("to");
  const from = fromQ && isDayString(fromQ) ? fromQ : null;
  const to = toQ && isDayString(toQ) ? toQ : null;

  if (mode === "stats") {
    const toStr = to ?? todayStr();
    const fromStr = from ?? addDaysStr(toStr, -29);
    const where: Prisma.AttendanceWhereInput = { classId: cls.id, date: { gte: parseDay(fromStr), lte: parseDay(toStr) } };
    const [byStudentRows, byDayRows, students] = await Promise.all([
      prisma.attendance.groupBy({ by: ["studentId", "status"], where, _count: { _all: true } }),
      prisma.attendance.groupBy({ by: ["date", "status"], where, _count: { _all: true } }),
      prisma.student.findMany({ where: { classId: cls.id }, select: { id: true, fullName: true, studentCode: true, status: true } }),
    ]);

    const per = new Map<string, Counts>();
    const overall = emptyCounts();
    for (const r of byStudentRows) {
      if (!per.has(r.studentId)) per.set(r.studentId, emptyCounts());
      per.get(r.studentId)![r.status as AttendanceStatusKey] = r._count._all;
      overall[r.status as AttendanceStatusKey] += r._count._all;
    }
    const byStudent = students
      .filter((s) => per.has(s.id))
      .map((s) => ({ studentId: s.id, fullName: s.fullName, studentCode: guest ? "" : s.studentCode, archived: s.status === "ARCHIVED", counts: per.get(s.id)!, rate: attendanceRate(per.get(s.id)!) }))
      .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.fullName.localeCompare(b.fullName));

    const wd = new Map<number, Counts>();
    const daily = new Map<string, Counts>();
    for (const r of byDayRows) {
      const dkey = fmtDay(r.date);
      const w = ((r.date.getUTCDay() + 6) % 7) + 1; // Dushanba=1
      if (!wd.has(w)) wd.set(w, emptyCounts());
      wd.get(w)![r.status as AttendanceStatusKey] += r._count._all;
      if (!daily.has(dkey)) daily.set(dkey, emptyCounts());
      daily.get(dkey)![r.status as AttendanceStatusKey] = r._count._all;
    }
    const byWeekday = [1, 2, 3, 4, 5, 6, 7]
      .filter((w) => wd.has(w))
      .map((w) => ({ weekday: w, counts: wd.get(w)!, rate: attendanceRate(wd.get(w)!) }));
    const trend = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({ date, counts, rate: attendanceRate(counts) }));

    return { from: fromStr, to: toStr, overall: { counts: overall, rate: attendanceRate(overall), days: daily.size }, byStudent, byWeekday, trend };
  }

  // records
  const { page, pageSize, skip, take } = paging(query, 25, 100);
  const status = query.get("status");
  const studentId = query.get("studentId");
  const where: Prisma.AttendanceWhereInput = {
    classId: cls.id,
    ...(studentId ? { studentId } : {}),
    ...(status && STATUSES.includes(status) ? { status: status as AttendanceStatusKey } : {}),
    ...(from || to ? { date: { ...(from ? { gte: parseDay(from) } : {}), ...(to ? { lte: parseDay(to) } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      orderBy: [{ date: "desc" }, { student: { fullName: "asc" } }],
      skip,
      take,
      include: { student: { select: { id: true, fullName: true, studentCode: true, photoUrl: true } }, markedBy: { select: { fullName: true } } },
    }),
    prisma.attendance.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      date: fmtDay(r.date),
      status: r.status,
      source: guest ? null : r.source,
      note: guest ? null : r.note,
      student: guest ? { id: r.student.id, fullName: r.student.fullName, studentCode: "", photoUrl: null } : r.student,
      markedBy: guest ? null : r.markedBy?.fullName ?? null,
    })),
    total,
    page,
    pageSize,
  };
});
