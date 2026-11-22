import { z } from "zod";
import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { buildReport, reportQuerySchema, safeFilename } from "@/lib/services/reports";
import { toCsv, toPdf, toXlsx } from "@/lib/services/report-export";

const MIME = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

export const GET = route({ cap: "class.manage", rate: { name: "report-export", limit: 20, windowMs: 60_000 } }, async ({ query, session, log }) => {
  const format = z.enum(["csv", "xlsx", "pdf"]).parse(query.get("format") ?? "csv");
  const q = reportQuerySchema.parse(Object.fromEntries(query.entries()));
  const report = await buildReport(q);
  const body = format === "csv" ? toCsv(report) : format === "xlsx" ? await toXlsx(report) : toPdf(report, session.fullName);
  await log({ action: "REPORT_EXPORT", category: "report", description: `${report.title} (${format.toUpperCase()}, ${report.from} — ${report.to}, ${report.rows.length} qator)` });
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${safeFilename(report, format)}"`,
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    },
  });
});
