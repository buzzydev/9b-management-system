"use client";

import { useEffect, useState } from "react";
import { DoorOpen, Search } from "lucide-react";
import { errMsg, qs, useApi } from "@/lib/client/api";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, Pagination, StatCard } from "@/components/ui/data";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";

type Rec = { id: string; studentId: string | null; studentName: string; date: string; hours: number; reason: string; createdAt: string; createdByName: string };
type Data = { items: Rec[]; total: number; pageSize: number; totalHours: number; facets: { students: { id: string; name: string }[]; authors: { id: string; name: string }[] } };
const hoursText = (h: number) => `${String(h).replace(".", ",")} soat`;
const EMPTY = { studentId: "", createdById: "", date: "", from: "", to: "", minHours: "", maxHours: "" };

export function EscapesView() {
  const [f, setF] = useState(EMPTY);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);
  const { data, error, isLoading, mutate } = useApi<Data>(`/api/escapes${qs({ ...f, q: dq, page, pageSize: 20 })}`);
  const set = (k: keyof typeof EMPTY, v: string) => { setF((p) => ({ ...p, [k]: v })); setPage(1); };
  const active = Object.values(f).some(Boolean) || !!q;

  return (
    <div className="space-y-4">
      <PageHeader title="Qochib ketganlar tarixi" description="Har bir qayd o'zgartirilmaydi va o'chirilmaydi. Yangi qayd Davomat sahifasida (ustoz, klasskom, yordamchi yoki administrator) kiritiladi." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Qaydlar soni" value={data?.total ?? "—"} icon={DoorOpen} tone="danger" loading={isLoading && !data} />
        <StatCard label="Jami ketgan vaqt" value={data ? hoursText(data.totalHours) : "—"} tone="warning" loading={isLoading && !data} hint="filtr bo'yicha" />
      </div>

      <Card className="space-y-2 p-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Ism, izoh yoki muallif bo'yicha qidirish…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" /></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={f.studentId} onChange={(e) => set("studentId", e.target.value)} aria-label="O'quvchi"><option value="">Barcha o'quvchilar</option>{data?.facets.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select value={f.createdById} onChange={(e) => set("createdById", e.target.value)} aria-label="Kim kiritgan"><option value="">Kim kiritgan: barchasi</option>{data?.facets.authors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Aniq sana<Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></label>
          <div className="flex items-center gap-2"><Input type="number" min={0} step={0.5} placeholder="Soat dan" value={f.minHours} onChange={(e) => set("minHours", e.target.value)} aria-label="Minimal soat" /><Input type="number" min={0} step={0.5} placeholder="gacha" value={f.maxHours} onChange={(e) => set("maxHours", e.target.value)} aria-label="Maksimal soat" /></div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Dan<Input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} disabled={!!f.date} /></label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Gacha<Input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} disabled={!!f.date} /></label>
          {active && <Button variant="ghost" onClick={() => { setF(EMPTY); setQ(""); setPage(1); }}>Filtrlarni tozalash</Button>}
        </div>
      </Card>

      <Card>
        {error && !data ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : isLoading && !data ? <ListSkeleton rows={6} /> : !data?.items.length ? <EmptyState icon={DoorOpen} title={active ? "Filtr bo'yicha qayd topilmadi" : "Hali qayd yo'q"} /> : (
          <>
            {/* Katta ekran: jadval */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 font-medium">O'quvchi</th><th className="px-3 py-2.5 font-medium">Sana</th><th className="px-3 py-2.5 font-medium">Ketgan muddat</th><th className="px-3 py-2.5 font-medium">Izoh</th><th className="px-3 py-2.5 font-medium">Kiritilgan vaqt</th><th className="px-3 py-2.5 font-medium">Kim kiritgan</th></tr></thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 align-top">
                      <td className="px-4 py-3 font-medium">{r.studentName}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-3 py-3 whitespace-nowrap font-semibold">{hoursText(r.hours)}</td>
                      <td className="max-w-xs whitespace-pre-wrap break-words px-3 py-3">{r.reason}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{fmtDateTime(r.createdAt)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{r.createdByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Telefon: kartalar */}
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((r) => (
                <li key={r.id} className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-2"><p className="font-medium">{r.studentName}</p><span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{hoursText(r.hours)}</span></div>
                  <p className="text-xs text-muted-foreground">Sana: {fmtDate(r.date)}</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">{r.createdByName} · {fmtDateTime(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {data && <div className="px-4"><Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>}
      </Card>
    </div>
  );
}
