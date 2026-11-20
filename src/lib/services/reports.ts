// Faqat server: hisobotlarni bazadan quradi. /api/reports va /api/reports/export shu yerdan foydalanadi.
import { z } from "zod";
import { prisma, getClass, getSystemSettings } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { dayString } from "@/lib/validators";
import { addDaysStr, eachDay, fmtDay, localParts, parseDay, startOfWeek, todayStr } from "@/lib/dates";
import { attendanceRate, average, emptyCounts, percent, round1, round2, type Counts } from "@/lib/stats";
import { dayRangeUtc } from "./tz";

export const REPORT_TYPES = ["attendance_daily", "attendance_weekly", "attendance_monthly", "student", "activity"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const reportQuerySchema = z.object({
  type: z.enum(REPORT_TYPES),
  from: dayString.optional(),
  to: dayString.optional(),
  studentId: z.string().min(1).max(64).optional(),
  subjectId: z.string().min(1).max(64).optional(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "ESCAPED"]).optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export type Cell = string | number | null;
export type Column = { key: string; label: string; align?: "left" | "right" | "center" };
export type Report = {
  type: ReportType;
  title: string;
  from: string;
  to: string;
  className: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  summary: { label: string; value: string }[];
  chart?: { kind: "bar"; xKey: string; unit?: string; max?: number; series: { key: string; label: string }[]; data: Record<string, Cell>[] };
  truncated: boolean;
};

export const STATUS_LABEL: Record<string, string> = { PRESENT: "Keldi", ABSENT: "Kelmadi", LATE: "Kechikdi", EXCUSED: "Sababli", ESCAPED: "Qochib ketdi" };
export const MAX_ROWS = 5000;

const pctText = (n: number | null) => (n == null ? "—" : `${n}%`);
const fmtLocal = (d: Date) => {
  const p = localParts(d);
  return `${p.date} ${p.time}`;
};

function resolveRange(q: ReportQuery) {
  const to = q.to ?? todayStr();
  let from = q.from;
  if (!from) {
    if (q.type === "attendance_daily") from = to;
    else if (q.type === "attendance_weekly") from = fmtDay(startOfWeek(parseDay(to)));
    else if (q.type === "attendance_monthly") from = to.slice(0, 8) + "01";
    else from = addDaysStr(to, -29);
  }
  if (q.type === "attendance_daily") from = to;
  if (from > to) throw new HttpError(400, "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas");
  const days = (parseDay(to).getTime() - parseDay(from).getTime()) / 86400000;
  if (days > 400) throw new HttpError(400, "Davr 400 kundan oshmasligi kerak");
  return { from, to };
}

type Counter = Map<string, Counts>;
function countsByStudent(rows: { studentId: string; status: keyof Counts; _count: { _all: number } }[]): Counter {
  const m: Counter = new Map();
  for (const r of rows) {
    const c = m.get(r.studentId) ?? emptyCounts();
    c[r.status] += r._count._all;
    m.set(r.studentId, c);
  }
  return m;
}

export async function buildReport(q: ReportQuery): Promise<Report> {
  const { from, to } = resolveRange(q);
  const cls = await getClass();
  const base = { type: q.type, from, to, className: cls.name, truncated: false };
  const dateWhere = { gte: parseDay(from), lte: parseDay(to) };

  switch (q.type) {
    case "attendance_daily": {
      const [students, records] = await Promise.all([
        prisma.student.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, studentCode: true } }),
        prisma.attendance.findMany({ where: { date: parseDay(to), student: { status: "ACTIVE" } }, select: { studentId: true, status: true, note: true } }),
      ]);
      const byStudent = new Map(records.map((r) => [r.studentId, r]));
      const counts = emptyCounts();
      let notMarked = 0;
      let rows = students.map((s, i) => {
        const r = byStudent.get(s.id);
        if (r) counts[r.status] += 1;
        else notMarked += 1;
        return { _status: r?.status ?? null, n: i + 1, studentCode: s.studentCode, fullName: s.fullName, status: r ? STATUS_LABEL[r.status] : "Belgilanmagan", note: r?.note ?? "" };
      });
      if (q.status) rows = rows.filter((r) => r._status === q.status);
      return {
        ...base,
        title: `Kunlik davomat — ${to}`,
        columns: [
          { key: "n", label: "№", align: "right" },
          { key: "studentCode", label: "ID" },
          { key: "fullName", label: "F.I.Sh." },
          { key: "status", label: "Holat" },
          { key: "note", label: "Izoh" },
        ],
        rows: rows.map(({ _status, ...r }) => r),
        summary: [
          { label: "Jami o'quvchi", value: String(students.length) },
          { label: STATUS_LABEL.PRESENT, value: String(counts.PRESENT) },
          { label: STATUS_LABEL.LATE, value: String(counts.LATE) },
          { label: STATUS_LABEL.ABSENT, value: String(counts.ABSENT) },
          { label: STATUS_LABEL.EXCUSED, value: String(counts.EXCUSED) },
          { label: STATUS_LABEL.ESCAPED, value: String(counts.ESCAPED) },
          { label: "Belgilanmagan", value: String(notMarked) },
          { label: "Davomat foizi", value: pctText(attendanceRate(counts)) },
        ],
        chart: {
          kind: "bar",
          xKey: "name",
          series: [{ key: "value", label: "O'quvchilar soni" }],
          data: [
            { name: STATUS_LABEL.PRESENT, value: counts.PRESENT },
            { name: STATUS_LABEL.LATE, value: counts.LATE },
            { name: STATUS_LABEL.ABSENT, value: counts.ABSENT },
            { name: STATUS_LABEL.EXCUSED, value: counts.EXCUSED },
            { name: STATUS_LABEL.ESCAPED, value: counts.ESCAPED },
            { name: "Belgilanmagan", value: notMarked },
          ],
        },
      };
    }

    case "attendance_weekly":
    case "attendance_monthly": {
      const [students, grouped, perDay] = await Promise.all([
        prisma.student.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, studentCode: true } }),
        prisma.attendance.groupBy({ by: ["studentId", "status"], where: { date: dateWhere, student: { status: "ACTIVE" } }, _count: { _all: true } }),
        prisma.attendance.groupBy({ by: ["date", "status"], where: { date: dateWhere, student: { status: "ACTIVE" } }, _count: { _all: true } }),
      ]);
      const per = countsByStudent(grouped);
      const total = emptyCounts();
      let rows = students.map((s) => {
        const c = per.get(s.id) ?? emptyCounts();
        (Object.keys(c) as (keyof Counts)[]).forEach((k) => (total[k] += c[k]));
        return { _c: c, studentCode: s.studentCode, fullName: s.fullName, present: c.PRESENT, late: c.LATE, absent: c.ABSENT, excused: c.EXCUSED, escaped: c.ESCAPED, rate: pctText(attendanceRate(c)) };
      });
      if (q.status) rows = rows.filter((r) => r._c[q.status!] > 0);
      let chart: Report["chart"];
      const dayMap = new Map<string, Counts>();
      for (const r of perDay) {
        const k = fmtDay(r.date);
        const c = dayMap.get(k) ?? emptyCounts();
        c[r.status] += r._count._all;
        dayMap.set(k, c);
      }
      const days = eachDay(parseDay(from), parseDay(to));
      if (days.length <= 62) {
        chart = {
          kind: "bar",
          xKey: "name",
          unit: "%",
          max: 100,
          series: [{ key: "rate", label: "Davomat foizi" }],
          data: days.filter((d) => dayMap.has(d)).map((d) => ({ name: d.slice(5), rate: attendanceRate(dayMap.get(d)!) })),
        };
      }
      return {
        ...base,
        title: q.type === "attendance_weekly" ? `Haftalik davomat — ${from} / ${to}` : `Oylik davomat — ${from} / ${to}`,
        columns: [
          { key: "studentCode", label: "ID" },
          { key: "fullName", label: "F.I.Sh." },
          { key: "present", label: "Keldi", align: "right" },
          { key: "late", label: "Kechikdi", align: "right" },
          { key: "absent", label: "Kelmadi", align: "right" },
          { key: "excused", label: "Sababli", align: "right" },
          { key: "escaped", label: "Qochib ketdi", align: "right" },
          { key: "rate", label: "Davomat", align: "right" },
        ],
        rows: rows.map(({ _c, ...r }) => r),
        summary: [
          { label: "O'quvchilar", value: String(students.length) },
          { label: "Belgilangan kunlar", value: String(dayMap.size) },
          { label: STATUS_LABEL.PRESENT, value: String(total.PRESENT) },
          { label: STATUS_LABEL.LATE, value: String(total.LATE) },
          { label: STATUS_LABEL.ABSENT, value: String(total.ABSENT) },
          { label: STATUS_LABEL.EXCUSED, value: String(total.EXCUSED) },
          { label: STATUS_LABEL.ESCAPED, value: String(total.ESCAPED) },
          { label: "O'rtacha davomat", value: pctText(attendanceRate(total)) },
        ],
        chart,
      };
    }

    case "student": {
      if (!q.studentId) throw new HttpError(400, "O'quvchini tanlang");
      const student = await prisma.student.findUnique({ where: { id: q.studentId } });
      if (!student) throw new HttpError(404, "O'quvchi topilmadi");
      const att = await prisma.attendance.findMany({ where: { studentId: student.id, date: dateWhere }, orderBy: { date: "asc" }, take: MAX_ROWS, select: { date: true, status: true, note: true } });
      const counts = emptyCounts();
      att.forEach((a) => (counts[a.status] += 1));
      const shownAtt = q.status ? att.filter((a) => a.status === q.status) : att;
      const rows: (Record<string, Cell> & { _d: string })[] = [
        ...shownAtt.map((a) => ({ _d: fmtDay(a.date), date: fmtDay(a.date), section: "Davomat", detail: a.note ?? "", value: STATUS_LABEL[a.status] })),
      ].sort((a, b) => (a._d < b._d ? -1 : a._d > b._d ? 1 : 0));
      return {
        ...base,
        title: `O'quvchi hisoboti — ${student.fullName}`,
        columns: [
          { key: "date", label: "Sana" },
          { key: "section", label: "Bo'lim" },
          { key: "detail", label: "Tafsilot" },
          { key: "value", label: "Natija", align: "right" },
        ],
        rows: rows.map(({ _d, ...r }) => r),
        summary: [
          { label: "O'quvchi", value: `${student.fullName} (${student.studentCode})` },
          { label: "Davomat", value: pctText(attendanceRate(counts)) },
          { label: STATUS_LABEL.ABSENT, value: String(counts.ABSENT) },
          { label: STATUS_LABEL.LATE, value: String(counts.LATE) },
          { label: STATUS_LABEL.EXCUSED, value: String(counts.EXCUSED) },
          { label: STATUS_LABEL.ESCAPED, value: String(counts.ESCAPED) },
        ],
      };
    }

    case "activity": {
      const [students, att] = await Promise.all([
        prisma.student.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, studentCode: true } }),
        prisma.attendance.groupBy({ by: ["studentId", "status"], where: { date: dateWhere, student: { status: "ACTIVE" } }, _count: { _all: true } }),
      ]);
      const per = countsByStudent(att);
      const rows = students.map((s) => {
        const c = per.get(s.id) ?? emptyCounts();
        return {
          studentCode: s.studentCode,
          fullName: s.fullName,
          attendance: pctText(attendanceRate(c)),
          present: c.PRESENT,
          late: c.LATE,
          absent: c.ABSENT,
          excused: c.EXCUSED,
          escaped: c.ESCAPED,
        };
      });
      return {
        ...base,
        title: `O'quvchilar faolligi — ${from} / ${to}`,
        columns: [
          { key: "studentCode", label: "ID" },
          { key: "fullName", label: "F.I.Sh." },
          { key: "attendance", label: "Davomat", align: "right" },
          { key: "present", label: STATUS_LABEL.PRESENT, align: "right" },
          { key: "late", label: STATUS_LABEL.LATE, align: "right" },
          { key: "absent", label: STATUS_LABEL.ABSENT, align: "right" },
          { key: "excused", label: STATUS_LABEL.EXCUSED, align: "right" },
          { key: "escaped", label: STATUS_LABEL.ESCAPED, align: "right" },
        ],
        rows,
        summary: [{ label: "O'quvchilar", value: String(students.length) }],
      };
    }
  }
}

export function safeFilename(r: Report, ext: string) {
  return `hisobot-${r.type}-${r.from}_${r.to}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}
