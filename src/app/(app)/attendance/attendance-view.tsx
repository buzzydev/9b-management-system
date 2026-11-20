"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, ChevronLeft, ChevronRight, DoorOpen, Lock, MessageSquare, QrCode, Save, Search, Users } from "lucide-react";
import { api, errMsg, qs, useApi } from "@/lib/client/api";
import { fmtDate, pct, todayLocalStr } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Pagination, StatCard } from "@/components/ui/data";
import { Avatar, Badge, EmptyState, ErrorState, ListSkeleton, STATUS_TONE, Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { C, ChartBox, ChartTooltip, STATUS_COLOR, axisProps } from "@/components/shared/charts";
import { cn } from "@/lib/utils";
import { QrDialog } from "./qr-dialog";
import { EscapeDialog } from "./escape-dialog";
import { useMe, useReadOnly } from "@/lib/client/providers";
import Link from "next/link";

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "ESCAPED";
const STATUSES: { v: Status; label: string; short: string }[] = [
  { v: "PRESENT", label: "Keldi", short: "K" },
  { v: "ABSENT", label: "Kelmadi", short: "Y" },
  { v: "LATE", label: "Kechikdi", short: "Ke" },
  { v: "EXCUSED", label: "Sababli", short: "S" },
];
// Qo'lda belgilanadigan 4 holat + faqat administrator tasdig'i bilan qo'yiladigan «Qochib ketdi»
const ALL_STATUSES = [...STATUSES, { v: "ESCAPED" as Status, label: "Qochib ketdi", short: "Q" }];
const LABEL: Record<string, string> = Object.fromEntries(ALL_STATUSES.map((s) => [s.v, s.label]));
const ACTIVE_CLS: Record<Status, string> = {
  PRESENT: "bg-success text-success-foreground border-success",
  ABSENT: "bg-destructive text-destructive-foreground border-destructive",
  LATE: "bg-warning text-warning-foreground border-warning",
  EXCUSED: "bg-info text-info-foreground border-info",
  ESCAPED: "bg-purple-600 text-white border-purple-600",
};

type Daily = {
  date: string;
  isToday: boolean;
  items: { id: string; fullName: string; studentCode: string; photoUrl: string | null; status: Status | null; note: string | null; source: string | null }[];
  summary: { total: number; marked: number; unmarked: number } & Record<Status, number>;
  rate: number | null;
  qrSession: { id: string; expiresAt: string; scans: number } | null;
};

const shiftDay = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

export function AttendanceView() {
  const [tab, setTab] = useState("daily");
  const [date, setDate] = useState<string>("");
  const [qrOpen, setQrOpen] = useState(false);
  const readOnly = useReadOnly();

  const openDay = (d: string) => {
    setDate(d);
    setTab("daily");
  };

  return (
    <div>
      <PageHeader
        title="Davomat"
        description={readOnly ? "Davomatni ko'rish (faqat o'qish)" : "Kunlik davomat, tarix, kalendar va statistika"}
        actions={readOnly ? undefined : <><Link href="/escapes" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-accent"><DoorOpen className="h-4 w-4" /> <span className="hidden sm:inline">Qochib ketganlar tarixi</span><span className="sm:hidden">Tarix</span></Link><Button onClick={() => setQrOpen(true)}><QrCode className="h-4 w-4" /> QR davomat</Button></>}
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: "daily", label: "Kunlik" },
          { value: "history", label: "Tarix" },
          { value: "calendar", label: "Kalendar" },
          { value: "stats", label: "Statistika" },
        ]}
      />
      {tab === "daily" && <DailyTab date={date} setDate={setDate} />}
      {tab === "history" && <HistoryTab />}
      {tab === "calendar" && <CalendarTab onPick={openDay} />}
      {tab === "stats" && <StatsTab />}
      {!readOnly && <QrDialog open={qrOpen} onClose={() => setQrOpen(false)} onScan={() => { import("swr").then(({ mutate }) => mutate((k) => typeof k === "string" && k.startsWith("/api/attendance"))); }} />}
    </div>
  );
}

/* ───────────── Kunlik ───────────── */
function DailyTab({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const { data, error, isLoading, mutate } = useApi<Daily>(`/api/attendance${qs({ date })}`);
  const [edits, setEdits] = useState<Record<string, { status: Status; note?: string | null }>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unmarked" | Status>("all");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = useMe().me?.user.role === "ADMIN";
  const readOnly = useReadOnly();
  const [escapeFor, setEscapeFor] = useState<{ id: string; fullName: string } | null>(null);

  useEffect(() => {
    if (data && !date) setDate(data.date);
  }, [data, date, setDate]);
  useEffect(() => setEdits({}), [data?.date]);

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (data?.items ?? [])
      .map((i) => ({ ...i, status: (edits[i.id]?.status ?? i.status) as Status | null, note: edits[i.id] && "note" in edits[i.id] ? edits[i.id].note ?? null : i.note }))
      .filter((i) => (t ? i.fullName.toLowerCase().includes(t) || i.studentCode.toLowerCase().includes(t) : true))
      .filter((i) => (filter === "all" ? true : filter === "unmarked" ? !i.status : i.status === filter));
  }, [data, edits, search, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, ESCAPED: 0, unmarked: 0 };
    for (const i of data?.items ?? []) {
      const s = edits[i.id]?.status ?? i.status;
      if (s) c[s]++;
      else c.unmarked++;
    }
    return c;
  }, [data, edits]);

  const dirty = Object.keys(edits).length;
  const set = (id: string, status: Status) => setEdits((e) => ({ ...e, [id]: { ...e[id], status } }));
  const setNote = (id: string, note: string, current: Status | null) => setEdits((e) => ({ ...e, [id]: { status: e[id]?.status ?? current ?? "PRESENT", note } }));

  const markAllPresent = () => {
    const next = { ...edits };
    for (const i of data?.items ?? []) if (!(edits[i.id]?.status ?? i.status)) next[i.id] = { ...next[i.id], status: "PRESENT" };
    setEdits(next);
  };

  const save = async () => {
    if (!data || !dirty) return;
    setSaving(true);
    try {
      const entries = Object.entries(edits).map(([studentId, v]) => ({ studentId, status: v.status, note: v.note ?? undefined }));
      await api("/api/attendance", { method: "PUT", body: { date: data.date, entries } });
      toast.success(`Davomat saqlandi (${entries.length} ta o'zgarish)`);
      setEdits({});
      mutate();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const goDay = (n: number) => data && setDate(shiftDay(data.date, n));

  return (
    <div className="pb-20">
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Oldingi kun" onClick={() => goDay(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" className="w-auto" value={data?.date ?? date} max={todayLocalStr()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <Button variant="outline" size="icon" aria-label="Keyingi kun" disabled={!data || data.isToday} onClick={() => goDay(1)}><ChevronRight className="h-4 w-4" /></Button>
          {data && <span className="text-sm text-muted-foreground">{fmtDate(data.date, "EEEE")}{data.isToday && " · bugun"}</span>}
          {!readOnly && <Button variant="secondary" size="sm" className="ml-auto" onClick={markAllPresent} disabled={!data?.items.length}><Check className="h-4 w-4" /> Hammasi keldi</Button>}
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { k: "all", label: `Hammasi ${data?.items.length ?? 0}` },
          { k: "PRESENT", label: `Keldi ${counts.PRESENT}` },
          { k: "ABSENT", label: `Kelmadi ${counts.ABSENT}` },
          { k: "LATE", label: `Kechikdi ${counts.LATE}` },
          { k: "EXCUSED", label: `Sababli ${counts.EXCUSED}` },
          { k: "ESCAPED", label: `Qochib ketdi ${counts.ESCAPED}` },
          { k: "unmarked", label: `Belgilanmagan ${counts.unmarked}` },
        ].map((c) => (
          <button key={c.k} onClick={() => setFilter(c.k as typeof filter)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", filter === c.k ? "border-brand bg-brand/15 text-brand" : "border-border text-muted-foreground hover:bg-accent")}>
            {c.label}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="O'quvchini qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        {error && !data ? (
          <ErrorState message={errMsg(error)} onRetry={() => mutate()} />
        ) : isLoading && !data ? (
          <ListSkeleton rows={8} />
        ) : !rows.length ? (
          <EmptyState icon={Users} title={data?.items.length ? "Mos o'quvchi topilmadi" : "Faol o'quvchilar yo'q"} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r, idx) => (
              <li key={r.id} className="p-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-6 text-center text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
                  <Avatar name={r.fullName} src={r.photoUrl} size={40} />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium">{r.fullName}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {!readOnly && r.studentCode}
                      {data?.items.find((x) => x.id === r.id)?.source === "QR" && !edits[r.id] && <Badge tone="info" className="px-1.5 py-0 text-[10px]">QR</Badge>}
                    </p>
                  </div>
                  {readOnly ? (
                    r.status ? <Badge tone={STATUS_TONE[r.status]}>{LABEL[r.status]}</Badge> : <Badge tone="outline">Belgilanmagan</Badge>
                  ) : r.status === "ESCAPED" && !isAdmin ? (
                    <Badge tone="danger" className="gap-1"><Lock className="h-3 w-3" /> Qochib ketdi</Badge>
                  ) : (
                  <div className="flex gap-1.5" role="group" aria-label={`${r.fullName} davomati`}>
                    {r.status === "ESCAPED" && <Badge tone="danger" className="self-center">Qochib ketdi</Badge>}
                    {STATUSES.map((s) => (
                      <button
                        key={s.v}
                        onClick={() => set(r.id, s.v)}
                        aria-pressed={r.status === s.v}
                        title={s.label}
                        className={cn(
                          "h-9 min-w-[3.1rem] rounded-lg border px-2 text-xs font-semibold transition-all active:scale-95 sm:min-w-[4.6rem]",
                          r.status === s.v ? ACTIVE_CLS[s.v] : "border-border bg-card text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <span className="sm:hidden">{s.short}</span>
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                    ))}
                    {r.status !== "ESCAPED" && (
                      <button onClick={() => setNoteFor(noteFor === r.id ? null : r.id)} aria-label="Izoh" className={cn("flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent", r.note && "text-brand")}>
                        <MessageSquare className="h-4 w-4" />
                      </button>
                    )}
                    {r.status !== "ESCAPED" && (
                      <button onClick={() => setEscapeFor({ id: r.id, fullName: r.fullName })} aria-label="Qochib ketdi" title="Qochib ketdi" className="flex h-9 items-center gap-1 rounded-lg border border-purple-600/40 px-2 text-xs font-semibold text-purple-600 hover:bg-purple-600/10 dark:text-purple-400">
                        <DoorOpen className="h-4 w-4" /><span className="hidden sm:inline">Qochib ketdi</span>
                      </button>
                    )}
                  </div>
                  )}
                </div>
                {!readOnly && r.status === "ESCAPED" && r.note && <p className="mt-2 break-words rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{r.note}</p>}
                {!readOnly && r.status !== "ESCAPED" && (noteFor === r.id || (r.note && noteFor !== r.id)) && (
                  <Input className="mt-2 h-9" placeholder="Izoh (masalan: kasal, oilaviy sabab)" maxLength={200} value={r.note ?? ""} onFocus={() => setNoteFor(r.id)} onChange={(e) => setNote(r.id, e.target.value, r.status)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Saqlash paneli */}
      <div className="safe-bottom fixed inset-x-0 bottom-[4.4rem] z-20 px-3 lg:bottom-4 lg:left-64">
        <div className={cn("mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur transition-all", dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0")}>
          <span className="flex-1 text-sm"><b>{dirty}</b> ta o'zgarish saqlanmagan</span>
          <Button variant="ghost" size="sm" onClick={() => setEdits({})}>Bekor qilish</Button>
          <Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Saqlash</Button>
        </div>
      </div>
      {!readOnly && <EscapeDialog student={escapeFor} date={data?.date ?? date} onClose={() => setEscapeFor(null)} />}
    </div>
  );
}

/* ───────────── Tarix ───────────── */
function HistoryTab() {
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const { data: studs } = useApi<{ items: { id: string; fullName: string }[] }>("/api/students?pageSize=100&status=ALL");
  const { data, error, isLoading, mutate } = useApi<{
    items: { id: string; date: string; status: Status; source: string; note: string | null; student: { id: string; fullName: string; studentCode: string; photoUrl: string | null }; markedBy: string | null }[];
    total: number;
  }>(`/api/attendance/history${qs({ mode: "records", studentId, status, from, to, page, pageSize: 25 })}`);

  const reset = (fn: () => void) => { fn(); setPage(1); };
  return (
    <Card>
      <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={studentId} onChange={(e) => reset(() => setStudentId(e.target.value))} aria-label="O'quvchi">
          <option value="">Barcha o'quvchilar</option>
          {studs?.items.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </Select>
        <Select value={status} onChange={(e) => reset(() => setStatus(e.target.value))} aria-label="Holat">
          <option value="">Barcha holatlar</option>
          {ALL_STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </Select>
        <Input type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} aria-label="Dan" />
        <Input type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} aria-label="Gacha" />
      </div>
      {error ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : isLoading && !data ? <ListSkeleton /> : !data?.items.length ? <EmptyState title="Yozuvlar topilmadi" /> : (
        <ul className="divide-y divide-border">
          {data.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={r.student.fullName} src={r.student.photoUrl} size={34} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium">{r.student.fullName}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(r.date, "d MMM yyyy, EEE")}{r.markedBy ? ` · ${r.markedBy}` : r.source === "QR" ? " · QR" : ""}</p>
              </div>
              {r.note && <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{r.note}</span>}
              <Badge tone={STATUS_TONE[r.status]}>{LABEL[r.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
      {data && <div className="px-4"><Pagination page={page} pageSize={25} total={data.total} onPage={setPage} /></div>}
    </Card>
  );
}

/* ───────────── Kalendar ───────────── */
function CalendarTab({ onPick }: { onPick: (d: string) => void }) {
  const [month, setMonth] = useState(() => todayLocalStr().slice(0, 7));
  const { data, error, isLoading, mutate } = useApi<{ days: { date: string; counts: Record<Status, number>; rate: number | null }[]; totalStudents: number }>(`/api/attendance/history?mode=calendar&month=${month}`);
  const byDate = new Map(data?.days.map((d) => [d.date, d]));
  const first = new Date(month + "-01T00:00:00Z");
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const shiftMonth = (n: number) => setMonth(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1)).toISOString().slice(0, 7));
  const today = todayLocalStr();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <Button variant="outline" size="icon" aria-label="Oldingi oy" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <CardTitle className="capitalize">{fmtDate(month + "-01", "LLLL yyyy")}</CardTitle>
        <Button variant="outline" size="icon" aria-label="Keyingi oy" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent>
        {error ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"].map((d) => <div key={d} className="py-1 font-medium">{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const info = byDate.get(d);
                const future = d > today;
                return (
                  <button
                    key={d}
                    disabled={future}
                    onClick={() => onPick(d)}
                    className={cn("flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors", d === today ? "border-brand" : "border-border", future ? "opacity-40" : "hover:bg-accent", isLoading && "animate-pulse")}
                  >
                    <span className="font-medium">{Number(d.slice(8))}</span>
                    {info ? (
                      <span className="mt-0.5 flex gap-0.5">
                        {(["PRESENT", "LATE", "ABSENT", "EXCUSED", "ESCAPED"] as Status[]).map((s) => info.counts[s] > 0 && <span key={s} title={`${LABEL[s]}: ${info.counts[s]}`} className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />)}
                      </span>
                    ) : null}
                    {info && <span className="hidden text-[10px] text-muted-foreground sm:block">{pct(info.rate)}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {ALL_STATUSES.map((s) => <span key={s.v} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s.v] }} />{s.label}</span>)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────── Statistika ───────────── */
function StatsTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, error, isLoading, mutate } = useApi<{
    from: string; to: string;
    overall: { counts: Record<Status, number>; rate: number | null; days: number };
    byStudent: { studentId: string; fullName: string; counts: Record<Status, number>; rate: number | null }[];
    byWeekday: { weekday: number; rate: number | null }[];
    trend: { date: string; rate: number | null }[];
  }>(`/api/attendance/history${qs({ mode: "stats", from, to })}`);
  const WD = ["", "Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

  if (error && !data) return <Card><ErrorState message={errMsg(error)} onRetry={() => mutate()} /></Card>;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Input type="date" className="w-auto" value={from || data?.from || ""} onChange={(e) => setFrom(e.target.value)} aria-label="Dan" />
        <span className="text-muted-foreground">—</span>
        <Input type="date" className="w-auto" value={to || data?.to || ""} onChange={(e) => setTo(e.target.value)} aria-label="Gacha" />
        <p className="ml-auto text-xs text-muted-foreground">Foiz = (Keldi + Kechikdi) / (Keldi + Kechikdi + Kelmadi). Sababli kunlar hisobga olinmaydi.</p>
      </Card>
      {isLoading && !data ? <Skeleton className="h-64" /> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="O'rtacha davomat" value={pct(data.overall.rate)} tone="info" hint={`${data.overall.days} kun`} />
            {ALL_STATUSES.map((s) => <StatCard key={s.v} label={s.label} value={data.overall.counts[s.v]} tone={s.v === "PRESENT" ? "success" : s.v === "ABSENT" ? "danger" : s.v === "LATE" ? "warning" : "info"} />)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Kunlar bo'yicha dinamika</CardTitle></CardHeader>
              <CardContent>
                {!data.trend.length ? <p className="py-8 text-center text-sm text-muted-foreground">Ma'lumot yo'q</p> : (
                  <ChartBox height={220}><ResponsiveContainer><LineChart data={data.trend.map((t) => ({ ...t, label: fmtDate(t.date, "d MMM"), rate: t.rate ?? 0 }))} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="label" {...axisProps} /><YAxis domain={[0, 100]} {...axisProps} />
                    <Tooltip content={<ChartTooltip suffix="%" nameMap={{ rate: "Davomat" }} />} /><Line type="monotone" dataKey="rate" stroke={C.brand} strokeWidth={2.5} dot={false} />
                  </LineChart></ResponsiveContainer></ChartBox>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Hafta kunlari bo'yicha</CardTitle></CardHeader>
              <CardContent>
                {!data.byWeekday.length ? <p className="py-8 text-center text-sm text-muted-foreground">Ma'lumot yo'q</p> : (
                  <ChartBox height={220}><ResponsiveContainer><BarChart data={data.byWeekday.map((w) => ({ label: WD[w.weekday], rate: w.rate ?? 0 }))} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="label" {...axisProps} /><YAxis domain={[0, 100]} {...axisProps} />
                    <Tooltip content={<ChartTooltip suffix="%" nameMap={{ rate: "Davomat" }} />} cursor={{ fill: "hsl(var(--accent))" }} /><Bar dataKey="rate" fill={C.blue} radius={[6, 6, 0, 0]} />
                  </BarChart></ResponsiveContainer></ChartBox>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>O'quvchilar bo'yicha</CardTitle></CardHeader>
            <CardContent>
              {!data.byStudent.length ? <p className="py-6 text-center text-sm text-muted-foreground">Ma'lumot yo'q</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="py-2">O'quvchi</th>{ALL_STATUSES.map((s) => <th key={s.v} className="py-2 text-center">{s.label}</th>)}<th className="py-2 text-right">Foiz</th></tr></thead>
                    <tbody>
                      {data.byStudent.map((s) => (
                        <tr key={s.studentId} className="border-b border-border/60">
                          <td className="py-2 font-medium">{s.fullName}</td>
                          {ALL_STATUSES.map((x) => <td key={x.v} className="py-2 text-center tabular-nums">{s.counts[x.v]}</td>)}
                          <td className="py-2 text-right"><Badge tone={s.rate == null ? "outline" : s.rate >= 90 ? "success" : s.rate >= 75 ? "warning" : "danger"}>{pct(s.rate)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
