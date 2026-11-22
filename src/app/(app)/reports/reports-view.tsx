"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { downloadUrl, errMsg, qs, useApi } from "@/lib/client/api";
import { todayLocalStr } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { C, ChartBox, ChartTooltip, axisProps } from "@/components/shared/charts";

const TYPES: [string, string][] = [
  ["attendance_daily", "Kunlik davomat"], ["attendance_weekly", "Haftalik davomat"], ["attendance_monthly", "Oylik davomat"],
  ["student", "O'quvchi hisoboti"], ["activity", "Faollik hisoboti"],
];
const SERIES = [C.brand, C.blue, C.amber, C.red];
type Cell = string | number | null;
type Report = {
  title: string; from: string; to: string; className: string;
  columns: { key: string; label: string; align?: string }[]; rows: Record<string, Cell>[];
  summary: { label: string; value: string }[];
  chart?: { xKey: string; unit?: string; max?: number; series: { key: string; label: string }[]; data: Record<string, Cell>[] };
  truncated: boolean;
};

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }

export function ReportsView() {
  const [f, setF] = useState({ type: "attendance_monthly", from: monthStart(), to: todayLocalStr(), studentId: "", subjectId: "", status: "" });
  const [applied, setApplied] = useState(f);
  const { data: studs } = useApi<{ items: { id: string; fullName: string }[] }>("/api/students?pageSize=100&status=ALL");
  const query = qs(applied);
  const { data, error, isLoading, mutate } = useApi<Report>(`/api/reports${query}`);
  const dirty = JSON.stringify(f) !== JSON.stringify(applied);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const exp = (format: string) => downloadUrl(`/api/reports/export${qs({ ...applied, format })}`);
  const showStatus = f.type.startsWith("attendance") || f.type === "student";
  const showStudent = ["attendance_daily", "attendance_weekly", "attendance_monthly", "student"].includes(f.type);

  return (
    <div className="space-y-4">
      <PageHeader title="Hisobotlar" description="Barcha hisobotlar bazadagi haqiqiy ma'lumotlardan quriladi" />
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
          <Field label="Hisobot turi"><Select value={f.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Dan"><Input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="Gacha"><Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set("to", e.target.value)} /></Field>
          {showStudent && <Field label="O'quvchi"><Select value={f.studentId} onChange={(e) => set("studentId", e.target.value)}><option value="">Barchasi</option>{studs?.items.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></Field>}
          {showStatus && <Field label="Davomat holati"><Select value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">Barchasi</option><option value="PRESENT">Keldi</option><option value="ABSENT">Kelmadi</option><option value="LATE">Kechikdi</option><option value="EXCUSED">Sababli</option></Select></Field>}
          <div className="flex items-end"><Button type="submit" className="w-full" loading={isLoading && dirty}><Table2 className="h-4 w-4" /> Hisobotni yaratish</Button></div>
        </form>
      </Card>

      {error && !data ? <Card><ErrorState message={errMsg(error)} onRetry={() => mutate()} /></Card> : !data ? <Skeleton className="h-72" /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-lg font-semibold">{data.title}</h2><p className="text-sm text-muted-foreground">{data.className} · {data.from} — {data.to} · {data.rows.length} qator</p></div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => exp("pdf")}><FileText className="h-4 w-4" /> PDF</Button>
              <Button size="sm" variant="outline" onClick={() => exp("xlsx")}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
              <Button size="sm" variant="outline" onClick={() => exp("csv")}><Download className="h-4 w-4" /> CSV</Button>
            </div>
          </div>
          {data.summary.length > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{data.summary.map((s) => <StatCard key={s.label} label={s.label} value={s.value} tone="brand" />)}</div>}
          {data.chart && data.chart.data.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Diagramma</CardTitle></CardHeader>
              <CardContent>
                <ChartBox><ResponsiveContainer><BarChart data={data.chart.data} margin={{ left: -16, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey={data.chart.xKey} {...axisProps} /><YAxis {...axisProps} domain={data.chart.max ? [0, data.chart.max] : undefined} unit={data.chart.unit} />
                  <Tooltip content={<ChartTooltip nameMap={Object.fromEntries(data.chart.series.map((s) => [s.key, s.label]))} />} cursor={{ fill: "hsl(var(--accent))" }} />
                  {data.chart.series.length > 1 && <Legend formatter={(v) => data.chart!.series.find((s) => s.key === v)?.label ?? v} />}
                  {data.chart.series.map((s, i) => <Bar key={s.key} dataKey={s.key} fill={SERIES[i % SERIES.length]} radius={[4, 4, 0, 0]} />)}
                </BarChart></ResponsiveContainer></ChartBox>
              </CardContent>
            </Card>
          )}
          <Card>
            {!data.rows.length ? <EmptyState icon={Table2} title="Bu filtrlar bo'yicha ma'lumot yo'q" /> : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr>{data.columns.map((c) => <th key={c.key} className={`px-3 py-2.5 font-medium ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>{c.label}</th>)}</tr></thead>
                  <tbody>{data.rows.slice(0, 500).map((r, i) => <tr key={i} className="border-b border-border/60">{data.columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""}`}>{r[c.key] ?? "—"}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            {data.rows.length > 500 && <p className="border-t border-border p-3 text-xs text-muted-foreground">Ko'rinishda dastlabki 500 qator. To'liq ma'lumot uchun PDF/Excel/CSV yuklab oling.</p>}
            {data.truncated && <p className="border-t border-border p-3 text-xs text-warning">Natija juda katta — faqat dastlabki 5000 qator olindi. Davrni toraytiring.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
