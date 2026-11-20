"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { uz } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { api, errMsg, revalidatePrefix, useApi } from "@/lib/client/api";
import { fmtDateTime, fmtTime, fromLocalInput, toLocalInput } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/client/providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/data";
import { Dialog } from "@/components/ui/dialog";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";

const TYPES: Record<string, { label: string; dot: string }> = {
  EXAM: { label: "Imtihon", dot: "bg-destructive" },
  TEST: { label: "Test", dot: "bg-warning" },
  DEADLINE: { label: "Muddat", dot: "bg-orange-500" },
  SCHOOL_EVENT: { label: "Maktab tadbiri", dot: "bg-primary" },
  MEETING: { label: "Uchrashuv", dot: "bg-sky-500" },
  HOLIDAY: { label: "Bayram", dot: "bg-success" },
  ANNOUNCEMENT: { label: "E'lon", dot: "bg-violet-500" },
};
const REMINDERS: [string, string][] = [["", "Eslatmasiz"], ["0", "Boshlanganda"], ["15", "15 daqiqa oldin"], ["60", "1 soat oldin"], ["1440", "1 kun oldin"], ["10080", "1 hafta oldin"]];
const WD = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

type Ev = { id: string; title: string; description: string | null; type: string; startsAt: string; endsAt: string | null; allDay: boolean; reminderMinutes: number | null; virtual: boolean };
type Mode = "month" | "week" | "day";

export function CalendarView() {
  const ro = useReadOnly();
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [sel, setSel] = useState<Ev | "new" | null>(null);
  const [newDate, setNewDate] = useState<Date>(new Date());

  const range = useMemo(() => {
    if (mode === "month") return { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: addDays(endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }), 1) };
    if (mode === "week") { const f = startOfWeek(cursor, { weekStartsOn: 1 }); return { from: f, to: addDays(f, 7) }; }
    const f = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    return { from: f, to: addDays(f, 1) };
  }, [mode, cursor]);

  const { data, error, isLoading, mutate } = useApi<{ items: Ev[] }>(`/api/calendar?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`);
  const items = data?.items ?? [];
  const on = (d: Date) => items.filter((e) => isSameDay(new Date(e.startsAt), d));

  const step = (dir: 1 | -1) => setCursor((c) => (mode === "month" ? addMonths(c, dir) : mode === "week" ? addWeeks(c, dir) : addDays(c, dir)));
  const title = mode === "month" ? format(cursor, "LLLL yyyy", { locale: uz }) : mode === "week" ? `${format(range.from, "d MMM", { locale: uz })} – ${format(addDays(range.to, -1), "d MMM yyyy", { locale: uz })}` : format(cursor, "d MMMM yyyy, EEEE", { locale: uz });
  const create = (d: Date) => { if (ro) return; setNewDate(d); setSel("new"); };
  const days = Array.from({ length: Math.round((range.to.getTime() - range.from.getTime()) / 86400000) }, (_, i) => addDays(range.from, i));

  const chip = (e: Ev) => (
    <button key={e.id} onClick={(ev) => { ev.stopPropagation(); setSel(e); }} className="flex w-full items-center gap-1.5 truncate rounded-md bg-muted px-1.5 py-0.5 text-left text-xs hover:bg-accent" title={e.title}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPES[e.type]?.dot)} />
      <span className="truncate">{!e.allDay && mode !== "month" ? `${fmtTime(e.startsAt)} ` : ""}{e.title}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Kalendar" description="Imtihonlar, muddatlar, tadbirlar va uchrashuvlar" actions={ro ? undefined : <Button size="sm" onClick={() => create(new Date())}><Plus className="h-4 w-4" /> Tadbir</Button>} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Oldingi" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Bugun</Button>
          <Button variant="outline" size="icon-sm" aria-label="Keyingi" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
          <h2 className="ml-2 text-lg font-semibold capitalize">{title}</h2>
        </div>
        <Tabs value={mode} onChange={setMode} items={[{ value: "month", label: "Oy" }, { value: "week", label: "Hafta" }, { value: "day", label: "Kun" }]} />
      </div>

      {error && !data ? <Card><ErrorState message={errMsg(error)} onRetry={() => mutate()} /></Card> : isLoading && !data ? <Skeleton className="h-96" /> : mode === "month" ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-muted/50 text-center text-xs font-medium text-muted-foreground">{WD.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const evs = on(d);
              return (
                <div key={d.toISOString()} onClick={() => create(d)} className={cn("min-h-20 cursor-pointer space-y-1 border-b border-r border-border/60 p-1 hover:bg-accent/40 sm:min-h-28", !isSameMonth(d, cursor) && "bg-muted/30 text-muted-foreground")}>
                  <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", isSameDay(d, new Date()) && "bg-primary font-semibold text-primary-foreground")}>{d.getDate()}</span>
                  <div className="hidden space-y-0.5 sm:block">{evs.slice(0, 3).map(chip)}{evs.length > 3 && <p className="px-1 text-xs text-muted-foreground">+{evs.length - 3} ta</p>}</div>
                  <div className="flex flex-wrap gap-0.5 sm:hidden">{evs.slice(0, 4).map((e) => <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", TYPES[e.type]?.dot)} />)}</div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className={cn("grid gap-3", mode === "week" && "md:grid-cols-2 lg:grid-cols-3")}>
          {days.map((d) => {
            const evs = on(d);
            return (
              <Card key={d.toISOString()} className={cn("p-3", isSameDay(d, new Date()) && "border-primary")}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold capitalize">{format(d, "EEEE, d MMM", { locale: uz })}</p>
                  {!ro && <Button variant="ghost" size="icon-sm" aria-label="Qo'shish" onClick={() => create(d)}><Plus className="h-4 w-4" /></Button>}
                </div>
                {!evs.length ? <p className="py-2 text-xs text-muted-foreground">Tadbirlar yo'q</p> : <div className="space-y-1">{evs.map(chip)}</div>}
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{Object.values(TYPES).map((t) => <span key={t.label} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", t.dot)} />{t.label}</span>)}</div>

      <EventDialog target={sel} defaultDate={newDate} onClose={() => setSel(null)} onSaved={() => { setSel(null); mutate(); revalidatePrefix("/api/dashboard", "/api/notifications"); }} />
    </div>
  );
}

function EventDialog({ target, defaultDate, onClose, onSaved }: { target: Ev | "new" | null; defaultDate: Date; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const ev = target && target !== "new" ? target : null;
  const readOnly = !!ev?.virtual;
  const blank = () => ({ title: "", description: "", type: "SCHOOL_EVENT", startsAt: "", endsAt: "", allDay: false, reminder: "" });
  const [f, setF] = useState(blank());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    if (ev) setF({ title: ev.title, description: ev.description ?? "", type: ev.type, startsAt: toLocalInput(ev.startsAt), endsAt: toLocalInput(ev.endsAt), allDay: ev.allDay, reminder: ev.reminderMinutes == null ? "" : String(ev.reminderMinutes) });
    else { const d = new Date(defaultDate); d.setHours(9, 0, 0, 0); setF({ ...blank(), startsAt: toLocalInput(d) }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, defaultDate]);

  const save = async () => {
    if (!f.title.trim()) return toast.error("Sarlavhani kiriting");
    if (!f.startsAt) return toast.error("Boshlanish vaqtini kiriting");
    if (f.endsAt && f.endsAt < f.startsAt) return toast.error("Tugash vaqti boshlanishdan oldin bo'lishi mumkin emas");
    const body = { title: f.title, description: f.description, type: f.type, startsAt: fromLocalInput(f.startsAt), endsAt: f.endsAt ? fromLocalInput(f.endsAt) : null, allDay: f.allDay, reminderMinutes: f.reminder === "" ? null : Number(f.reminder) };
    setBusy(true);
    try {
      if (ev) await api(`/api/calendar/${ev.id}`, { method: "PATCH", body });
      else await api("/api/calendar", { body });
      toast.success("Saqlandi");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!ev || !(await confirm({ title: "Tadbirni o'chirish", description: `“${ev.title}” o'chiriladi.`, confirmText: "O'chirish", destructive: true }))) return;
    try { await api(`/api/calendar/${ev.id}`, { method: "DELETE" }); toast.success("O'chirildi"); onSaved(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Dialog open={!!target} onClose={onClose} title={ev ? (readOnly ? "Uy vazifa muddati" : "Tadbirni tahrirlash") : "Yangi tadbir"}
      footer={readOnly ? <Button variant="outline" onClick={onClose}>Yopish</Button> : <>
        {ev && <Button variant="ghost" className="mr-auto text-destructive" onClick={remove}><Trash2 className="h-4 w-4" /> O'chirish</Button>}
        <Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button onClick={save} loading={busy}>Saqlash</Button></>}>
      {readOnly && ev ? (
        <div className="space-y-2 text-sm"><p className="font-medium">{ev.title}</p><p className="text-muted-foreground">Muddat: {fmtDateTime(ev.startsAt)}</p><Badge tone="info">Uy vazifalari bo'limidan</Badge><p className="text-xs text-muted-foreground">Muddatni Uy vazifalari bo'limida o'zgartiring.</p></div>
      ) : (
        <div className="space-y-3">
          <Field label="Sarlavha"><Input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Turi"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
            <Field label="Eslatma"><Select value={f.reminder} onChange={(e) => setF({ ...f, reminder: e.target.value })}>{REMINDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Boshlanishi"><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
            <Field label="Tugashi"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
          </div>
          <div className="flex items-center gap-2 text-sm"><Checkbox checked={f.allDay} onCheckedChange={(v) => setF({ ...f, allDay: v })} label="Kun bo'yi" /> Kun bo'yi</div>
          <Field label="Tavsif"><Textarea rows={3} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
      )}
    </Dialog>
  );
}
