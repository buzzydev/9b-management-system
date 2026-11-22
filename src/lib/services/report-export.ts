// Faqat server: hisobotni CSV / XLSX / PDF ga aylantiradi.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { localParts } from "@/lib/dates";
import type { Report } from "./reports";

/** CSV/Excel formula in'ektsiyasidan himoya: =, +, -, @ bilan boshlanuvchi katakka ' qo'shiladi */
export function safeCell(v: string | number | null): string | number {
  if (v == null) return "";
  if (typeof v === "number") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export function toCsv(r: Report): Buffer {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [r.columns.map((c) => esc(c.label)).join(",")];
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(safeCell(row[c.key] ?? null))).join(","));
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

export async function toXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 31).replace(/[\\/*?:[\]]/g, " "));
  ws.columns = r.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 4) }));
  for (const row of r.rows) {
    const o: Record<string, string | number> = {};
    for (const c of r.columns) o[c.key] = safeCell(row[c.key] ?? null);
    ws.addRow(o);
  }
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FF0B1B3A" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB0F2FF" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (r.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: r.columns.length } };
  ws.columns.forEach((col) => {
    let max = String(col.header ?? "").length;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      max = Math.max(max, String(cell.value ?? "").length);
    });
    col.width = Math.min(60, max + 3);
  });
  if (r.summary.length) {
    const s = wb.addWorksheet("Xulosa");
    s.columns = [{ header: "Ko'rsatkich", key: "k", width: 36 }, { header: "Qiymat", key: "v", width: 24 }];
    r.summary.forEach((x) => s.addRow({ k: x.label, v: safeCell(x.value) }));
    s.getRow(1).font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function fontB64(name: string): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "assets", "fonts", name)).toString("base64");
  } catch {
    return null;
  }
}

export function toPdf(r: Report, userName: string): Buffer {
  const doc = new jsPDF({ orientation: r.columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const regular = fontB64("DejaVuSans.ttf");
  const bold = fontB64("DejaVuSans-Bold.ttf");
  let family = "helvetica";
  if (regular && bold) {
    doc.addFileToVFS("DejaVuSans.ttf", regular);
    doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
    doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
    doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");
    family = "DejaVu";
  }
  const margin = 36;
  doc.setFont(family, "bold").setFontSize(16).text(r.title, margin, 44);
  doc.setFont(family, "normal").setFontSize(9);
  const p = localParts();
  doc.text(`Sinf: ${r.className}   Davr: ${r.from} — ${r.to}`, margin, 62);
  doc.text(`Tayyorladi: ${userName}   ${p.date} ${p.time}`, margin, 75);
  let y = 90;
  if (r.summary.length) {
    autoTable(doc, {
      startY: y,
      head: [["Ko'rsatkich", "Qiymat"]],
      body: r.summary.map((s) => [s.label, s.value]),
      styles: { font: family, fontSize: 9 },
      headStyles: { fillColor: [22, 110, 122], font: family, fontStyle: "bold" },
      tableWidth: 320,
      margin: { left: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }
  autoTable(doc, {
    startY: y,
    head: [r.columns.map((c) => c.label)],
    body: r.rows.map((row) => r.columns.map((c) => String(row[c.key] ?? ""))),
    styles: { font: family, fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [22, 110, 122], textColor: 255, font: family, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [240, 249, 251] },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      doc.setFontSize(8).setFont(family, "normal");
      doc.text(`${n}-bet`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 16, { align: "right" });
    },
  });
  return Buffer.from(doc.output("arraybuffer"));
}
