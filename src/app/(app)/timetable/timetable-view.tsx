"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CalendarOff, Clock, DoorOpen, Pencil, Plus, Trash2, User } from "lucide-react";
import { api, errMsg, revalidatePrefix, useApi } from "@/lib/client/api";
import { currentAndNext, findConflict, timeToMin, type Slot } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/data";
import { Badge, EmptyState, ErrorState, Progress, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { useReadOnly } from "@/lib/client/providers";
import { useConfirm } from "@/components/ui/confirm";

type SubjectLite = { id: string; name: string; shortName: string | null };
type Entry = {
  id: string;
  weekday: number;
  lessonNumber: number;
  subjectId: string;
  teacherName: string;
  room: string | null;
  startTime: string;
  endTime: string;
  subject: SubjectLite;
};
type Resp = {
  entries: Entry[];
  subjects: SubjectLite[];
  now: { date: string; weekday: number; time: string; minutes: number };
};

const DAYS = [
  { n: 1, full: "Dushanba", short: "Du" },
  { n: 2, full: "Seshanba", short: "Se" },
  { n: 3, full: "Chorshanba", short: "Ch" },
  { n: 4, full: "Payshanba", short: "Pa" },
  { n: 5, full: "Juma", short: "Ju" },
  { n: 6, full: "Shanba", short: "Sh" },
];
const dayName = (n: number) => DAYS.find((d) => d.n === n)?.full ?? "Yakshanba";

type Form = {
  id?: string;
  subjectId: string;
  weekday: string;
  lessonNumber: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  room: string;
};

function minToTime(m: number) {
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function TimetableView() {
  const ro = useReadOnly();
  const confirm = useConfirm();
  const { data, error, isLoading, mutate } = useApi<Resp>("/api/timetable", { refreshInterval: 60_000, revalidateOnFocus: true });
  const [dayPick, setDayPick] = useState<number | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const entries = data?.entries ?? [];
  const subjects = data?.subjects ?? [];
  const now = data?.now;

  const byDay = useMemo(() => {
    const m = new Map<number, Entry[]>();
    for (const e of entries) m.set(e.weekday, [...(m.get(e.weekday) ?? []), e]);
    for (const [k, v] of m) m.set(k, v.sort((a, b) => a.lessonNumber - b.lessonNumber));
    return m;
  }, [entries]);

  const lessonNumbers = useMemo(() => [...new Set(entries.map((e) => e.lessonNumber))].sort((a, b) => a - b), [entries]);

  const today = now?.weekday ?? 0;
  const todaySlots = byDay.get(today) ?? [];
  const { current, next } = useMemo(() => (now ? currentAndNext(todaySlots, now.minutes) : { current: null, next: null }), [todaySlots, now]);

  // Bugun keyingi dars qolmagan bo'lsa — keyingi dars kunining birinchi darsi
  const nextOther = useMemo(() => {
    if (!now || next) return null;
    for (let i = 1; i <= 7; i++) {
      const d = ((today - 1 + i) % 7) + 1;
      const list = byDay.get(d);
      if (list?.length) return { entry: list[0], day: d, tomorrow: i === 1 };
    }
    return null;
  }, [now, next, today, byDay]);

  const selectedDay = dayPick ?? (today >= 1 && today <= 6 ? today : (DAYS.find((d) => byDay.has(d.n))?.n ?? 1));

  function defaultTimes(weekday: number, n: number) {
    const same = entries.find((e) => e.lessonNumber === n);
    if (same) return { start: same.startTime, end: same.endTime };
    const prev = (byDay.get(weekday) ?? []).filter((e) => e.lessonNumber < n).pop();
    const start = prev ? timeToMin(prev.endTime) + 10 : 8 * 60 + (n - 1) * 55;
    return { start: minToTime(start), end: minToTime(start + 45) };
  }

  function openNew(weekday?: number, lessonNumber?: number) {
    if (ro) return;
    const wd = weekday ?? (selectedDay || 1);
    const n = lessonNumber ?? Math.min(12, Math.max(0, ...(byDay.get(wd) ?? []).map((e) => e.lessonNumber)) + 1);
    const t = defaultTimes(wd, n);
    setFormErr(null);
    setForm({ subjectId: "", weekday: String(wd), lessonNumber: String(n), startTime: t.start, endTime: t.end, teacherName: "", room: "" });
  }

  function openEdit(e: Entry) {
    if (ro) return;
    setFormErr(null);
    setForm({
      id: e.id,
      subjectId: e.subjectId,
      weekday: String(e.weekday),
      lessonNumber: String(e.lessonNumber),
      startTime: e.startTime,
      endTime: e.endTime,
      teacherName: e.teacherName,
      room: e.room ?? "",
    });
  }

  function setField<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setFormErr(null);
  }

  function pickSubject(subjectId: string) {
    setForm((f) => {
      if (!f) return f;
      const prevTeacher = entries.find((e) => e.subjectId === subjectId)?.teacherName;
      return { ...f, subjectId, teacherName: f.teacherName || prevTeacher || "" };
    });
    setFormErr(null);
  }

  async function refreshAll() {
    await Promise.all([mutate(), revalidatePrefix("/api/dashboard")]);
  }

  async function save() {
    if (!form) return;
    const lessonNumber = Number(form.lessonNumber);
    if (!form.subjectId) return setFormErr("Fanni tanlang");
    if (!form.teacherName.trim()) return setFormErr("O'qituvchi ismini kiriting");
    if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 12) return setFormErr("Dars raqami 1 dan 12 gacha bo'lishi kerak");
    const payload = {
      weekday: Number(form.weekday),
      lessonNumber,
      subjectId: form.subjectId,
      teacherName: form.teacherName.trim(),
      room: form.room.trim() || null,
      startTime: form.startTime,
      endTime: form.endTime,
    };
    const slot: Slot = { id: form.id, weekday: payload.weekday, lessonNumber, startTime: payload.startTime, endTime: payload.endTime };
    const conflict = findConflict(entries, slot);
    if (conflict) return setFormErr(conflict);
    setSaving(true);
    try {
      await api(form.id ? `/api/timetable/${form.id}` : "/api/timetable", { method: form.id ? "PATCH" : "POST", body: payload });
      toast.success(form.id ? "Dars yangilandi" : "Dars qo'shildi");
      setForm(null);
      await refreshAll();
    } catch (e) {
      setFormErr(errMsg(e)); // to'qnashuv (409) xatosi ham dialog ichida ko'rinadi
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    const e = entries.find((x) => x.id === form.id);
    const ok = await confirm({
      title: "Darsni o'chirasizmi?",
      description: e ? `${e.subject.name} — ${dayName(e.weekday)}, ${e.lessonNumber}-dars jadvaldan olib tashlanadi.` : undefined,
      confirmText: "O'chirish",
      destructive: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api(`/api/timetable/${form.id}`, { method: "DELETE" });
      toast.success("Dars o'chirildi");
      setForm(null);
      await refreshAll();
    } catch (er) {
      setFormErr(errMsg(er));
    } finally {
      setSaving(false);
    }
  }

  const isCurrent = (e: Entry) => !!current && current.id === e.id && e.weekday === today;

  return (
    <div>
      <PageHeader
        title="Dars jadvali"
        description={ro ? "Haftalik dars jadvali" : "Haftalik dars jadvali. Katakni bosib darsni tahrirlang."}
        actions={
          ro ? undefined : (
            <Button onClick={() => openNew()}>
              <Plus className="h-4 w-4" /> Dars qo&apos;shish
            </Button>
          )
        }
      />

      {error ? (
        <Card>
          <ErrorState message={errMsg(error)} onRetry={() => mutate()} />
        </Card>
      ) : isLoading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Hozirgi / keyingi dars */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className={cn("p-4", current && "border-brand/50 ring-1 ring-brand/30")}>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {current && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>}
                Hozirgi dars
              </div>
              {current && now ? (
                <>
                  <p className="text-lg font-semibold leading-tight">{(current as Entry).subject.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {current.lessonNumber}-dars · {current.startTime}–{current.endTime}
                    {current.room ? ` · ${current.room}-xona` : ""}
                  </p>
                  <Progress
                    className="mt-3"
                    value={((now.minutes - timeToMin(current.startTime)) / (timeToMin(current.endTime) - timeToMin(current.startTime))) * 100}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">Tugashiga {timeToMin(current.endTime) - now.minutes} daqiqa qoldi</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {today === 7 ? "Bugun yakshanba — dars yo'q." : todaySlots.length ? "Hozir dars ketmayapti." : "Bugun darslar yo'q."}
                </p>
              )}
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ArrowRight className="h-3.5 w-3.5" /> Keyingi dars
              </div>
              {next && now ? (
                <>
                  <p className="text-lg font-semibold leading-tight">{(next as Entry).subject.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {next.lessonNumber}-dars · {next.startTime}–{next.endTime}
                    {next.room ? ` · ${next.room}-xona` : ""}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">{timeToMin(next.startTime) - now.minutes} daqiqadan keyin boshlanadi</p>
                </>
              ) : nextOther ? (
                <>
                  <p className="text-lg font-semibold leading-tight">{nextOther.entry.subject.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {nextOther.tomorrow ? "Ertaga" : dayName(nextOther.day)} · {nextOther.entry.lessonNumber}-dars · {nextOther.entry.startTime}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Keyingi darslar yo&apos;q.</p>
              )}
            </Card>
          </div>

          {!entries.length ? (
            <Card>
              <EmptyState
                icon={CalendarOff}
                title="Dars jadvali bo'sh"
                description="Birinchi darsni qo'shing. Fanlar ro'yxati bo'sh bo'lsa, avval Baholar sahifasidagi «Fanlar» bo'limidan fan qo'shing."
                action={
                  ro ? undefined : (
                    <Button onClick={() => openNew(1, 1)}>
                      <Plus className="h-4 w-4" /> Dars qo&apos;shish
                    </Button>
                  )
                }
              />
            </Card>
          ) : (
            <>
              {/* Desktop: haftalik grid */}
              <Card className="hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="w-24 px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Dars</th>
                        {DAYS.map((d) => (
                          <th key={d.n} className={cn("px-3 py-3 text-left text-xs font-medium uppercase tracking-wide", d.n === today ? "bg-brand/10 text-brand" : "text-muted-foreground")}>
                            {d.full}
                            {d.n === today && <Badge tone="brand" className="ml-2 normal-case">Bugun</Badge>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lessonNumbers.map((n) => {
                        const ref = entries.find((e) => e.lessonNumber === n)!;
                        return (
                          <tr key={n} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-2 align-top">
                              <p className="text-base font-semibold tabular-nums">{n}</p>
                              <p className="text-xs tabular-nums text-muted-foreground">{ref.startTime}–{ref.endTime}</p>
                            </td>
                            {DAYS.map((d) => {
                              const e = byDay.get(d.n)?.find((x) => x.lessonNumber === n);
                              return (
                                <td key={d.n} className={cn("p-1.5 align-top", d.n === today && "bg-brand/5")}>
                                  {e ? (
                                    <button
                                      type="button"
                                      onClick={() => openEdit(e)}
                                      className={cn(
                                        "group relative w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        isCurrent(e) ? "border-brand bg-brand/15 shadow-sm" : "border-border bg-card",
                                      )}
                                    >
                                      {isCurrent(e) && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-success" aria-label="Hozir davom etmoqda" />}
                                      <p className="truncate font-medium leading-tight">{e.subject.shortName || e.subject.name}</p>
                                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.teacherName}</p>
                                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                                        {e.startTime}–{e.endTime}
                                        {e.room ? ` · ${e.room}` : ""}
                                      </p>
                                    </button>
                                  ) : ro ? null : (
                                    <button
                                      type="button"
                                      onClick={() => openNew(d.n, n)}
                                      aria-label={`${d.full}, ${n}-dars qo'shish`}
                                      className="flex h-full min-h-[3.5rem] w-full items-center justify-center rounded-lg border border-dashed border-transparent text-muted-foreground/0 transition-colors hover:border-border hover:text-muted-foreground focus-visible:border-border focus-visible:text-muted-foreground focus-visible:outline-none"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Bugungi jadval (desktop) */}
              {today >= 1 && today <= 6 && (
                <Card className="hidden md:block">
                  <CardHeader>
                    <CardTitle>Bugungi jadval</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {todaySlots.length ? (
                      <ul className="grid gap-2 lg:grid-cols-2">
                        {(todaySlots as Entry[]).map((e) => (
                          <LessonRow key={e.id} e={e} current={isCurrent(e)} onEdit={ro ? undefined : () => openEdit(e)} />
                        ))}
                      </ul>
                    ) : (
                      <p className="py-3 text-sm text-muted-foreground">Bugun darslar yo&apos;q.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Mobil: kun tablari + kartalar */}
              <div className="md:hidden">
                <Tabs
                  value={String(selectedDay)}
                  onChange={(v) => setDayPick(Number(v))}
                  items={DAYS.map((d) => ({
                    value: String(d.n),
                    label: d.short,
                    badge: d.n === today ? <span className="h-1.5 w-1.5 rounded-full bg-success" aria-label="Bugun" /> : undefined,
                  }))}
                />
                <h2 className="mb-2 mt-3 text-base font-semibold">{selectedDay === today ? "Bugungi jadval" : dayName(selectedDay)}</h2>
                {byDay.get(selectedDay)?.length ? (
                  <ul className="space-y-2">
                    {(byDay.get(selectedDay) as Entry[]).map((e) => (
                      <LessonRow key={e.id} e={e} current={isCurrent(e)} onEdit={ro ? undefined : () => openEdit(e)} />
                    ))}
                  </ul>
                ) : (
                  <Card>
                    <EmptyState
                      icon={CalendarOff}
                      title="Bu kunda dars yo'q"
                      action={
                        ro ? undefined : (
                          <Button variant="outline" size="sm" onClick={() => openNew(selectedDay)}>
                            <Plus className="h-4 w-4" /> Dars qo&apos;shish
                          </Button>
                        )
                      }
                    />
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <Dialog
        open={!!form}
        onClose={() => !saving && setForm(null)}
        title={form?.id ? "Darsni tahrirlash" : "Yangi dars"}
        footer={
          <>
            {form?.id && (
              <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto" onClick={remove} disabled={saving}>
                <Trash2 className="h-4 w-4" /> O&apos;chirish
              </Button>
            )}
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
              Bekor qilish
            </Button>
            <Button onClick={save} loading={saving}>
              Saqlash
            </Button>
          </>
        }
      >
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {formErr && (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formErr}
              </div>
            )}
            <Field label="Fan" required hint={!subjects.length ? "Fanlar yo'q. Avval Baholar sahifasidagi «Fanlar» bo'limidan fan qo'shing." : undefined}>
              <Select value={form.subjectId} onChange={(e) => pickSubject(e.target.value)}>
                <option value="">Fanni tanlang…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hafta kuni" required>
                <Select value={form.weekday} onChange={(e) => setField("weekday", e.target.value)}>
                  {DAYS.map((d) => (
                    <option key={d.n} value={d.n}>
                      {d.full}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dars raqami" required>
                <Input type="number" min={1} max={12} inputMode="numeric" value={form.lessonNumber} onChange={(e) => setField("lessonNumber", e.target.value)} />
              </Field>
              <Field label="Boshlanishi" required>
                <Input type="time" value={form.startTime} onChange={(e) => setField("startTime", e.target.value)} />
              </Field>
              <Field label="Tugashi" required>
                <Input type="time" value={form.endTime} onChange={(e) => setField("endTime", e.target.value)} />
              </Field>
            </div>
            <Field label="O'qituvchi" required>
              <Input value={form.teacherName} maxLength={100} onChange={(e) => setField("teacherName", e.target.value)} placeholder="Ism familiya" />
            </Field>
            <Field label="Xona">
              <Input value={form.room} maxLength={30} onChange={(e) => setField("room", e.target.value)} placeholder="Masalan: 214" />
            </Field>
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>
        )}
      </Dialog>
    </div>
  );
}

function LessonRow({ e, current, onEdit }: { e: Entry; current: boolean; onEdit?: () => void }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
        current ? "border-brand bg-brand/10" : "border-border bg-card",
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold tabular-nums", current ? "bg-brand text-white" : "bg-muted")}>{e.lessonNumber}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium leading-tight">
          <span className="truncate">{e.subject.name}</span>
          {current && <Badge tone="success">Hozir</Badge>}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums"><Clock className="h-3 w-3" />{e.startTime}–{e.endTime}</span>
          <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{e.teacherName}</span>
          {e.room && <span className="inline-flex items-center gap-1"><DoorOpen className="h-3 w-3" />{e.room}</span>}
        </p>
      </div>
      {onEdit && (
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Tahrirlash">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}
