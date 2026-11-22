import ExcelJS from "exceljs";
import { prisma, getClass } from "@/lib/db";
import { route } from "@/lib/api";
import { fmtDay, todayStr } from "@/lib/dates";
import { attendanceMap, studentWhere } from "@/lib/services/students";

const HEADERS = ["ID", "F.I.Sh.", "Tug'ilgan sana", "Telefon", "Ota-ona telefoni", "Qabul sanasi", "Holat", "Davomat %", "Izoh"];

/** CSV/Excel formula in'ektsiyasidan himoya: = + - @ bilan boshlangan matn oldiga ' qo'shiladi */
function safeCell(v: unknown): string | number {
  if (v == null) return "";
  if (typeof v === "number") return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvEscape(v: string | number) {
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = route({ cap: "class.manage", rate: { name: "student-export", limit: 20, windowMs: 10 * 60_000 } }, async ({ query, log }) => {
  const cls = await getClass();
  const format = query.get("format") === "xlsx" ? "xlsx" : "csv";
  const students = await prisma.student.findMany({ where: studentWhere(query, cls.id), orderBy: { fullName: "asc" }, take: 2000 });
  const rates = await attendanceMap(students.map((s) => s.id));

  const rows = students.map((s) => [
    safeCell(s.studentCode),
    safeCell(s.fullName),
    s.dateOfBirth ? fmtDay(s.dateOfBirth) : "",
    safeCell(s.phone),
    safeCell(s.parentPhone),
    fmtDay(s.enrolledAt),
    s.status === "ACTIVE" ? "Faol" : "Arxiv",
    rates.get(s.id)?.rate ?? "",
    safeCell(s.notes),
  ]);

  await log({ action: "STUDENT_EXPORT", category: "student", description: `O'quvchilar ro'yxati eksport qilindi (${format.toUpperCase()}, ${rows.length} ta)`, entityType: "Student" });
  const name = `oquvchilar-${todayStr()}.${format}`;

  if (format === "csv") {
    const csv = "﻿" + [HEADERS, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${cls.name} o'quvchilar`);
  ws.addRow(HEADERS).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c, i) => (c.width = [12, 30, 16, 18, 18, 14, 10, 12, 40][i] ?? 16));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
});
