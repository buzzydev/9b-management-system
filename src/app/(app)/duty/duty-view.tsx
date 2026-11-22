"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CalendarDays, Check, CheckCircle2, ClipboardList, Eraser, History, ListOrdered, Pencil, Repeat, RotateCcw, Settings2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { api, errMsg, qs, revalidatePrefix, useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/providers";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader, Pagination } from "@/components/ui/data";
import { Avatar, Badge, EmptyState, ErrorState, Progress, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { DUTY_STATUS_LABEL, DUTY_STATUS_TONE, type DutyOverview, type DutyPerson, type DutyStatus } from "@/components/shared/duty-types";

type HistoryRes = {
  items: { id: string; date: string; slot: number; studentId: string | null; name: string; photoUrl: string | null; status: DutyStatus; manual: boolean; replacedName: string | null; markedByName: string | null; markedAt: string | null }[];
  total: number;
  page: number;
  pageSize: number;
};

const WEEKDAY_SHORT = ["Du", "Se", "Chor", "Pay", "Ju", "Sha", "Yak"];
const TASK_ICONS = [Pencil, Eraser];
const STATE_LABEL = { today: "Bugun", pending: "Kutmoqda", served: "Bajargan", disabled: "Chiqarilgan" } as const;
const STATE_TONE = { today: "brand", pending: "warning", served: "success", disabled: "outline" } as const;

const dayLong = (d: string) => fmtDate(d, "EEEE, d-MMMM");
const dayMid = (d: string) => fmtDate(d, "EEE, d-MMM");

function Names({ people }: { people: DutyPerson[] }) {
  if (!people.length) return <span className="text-sm text-muted-foreground">Navbatchi yo'q</span>;
  return (
    <ul className="space-y-2">
      {people.map((p) => (
        <li key={p.studentId} className="flex items-center gap-3">
          <Avatar name={p.name} src={p.photoUrl} size={36} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

function TodayCard({ data, admin, onChanged }: { data: DutyOverview; admin: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [replace, setReplace] = useState<DutyOverview["todayDuty"][number] | null>(null);

  const setStatus = async (id: string, status: DutyStatus) => {
    setBusy(id + status);
    try {
      await api(`/api/duty/${id}`, { method: "PATCH", body: { status } });
      toast.success(status === "DONE" ? "Bajarildi deb belgilandi" : status === "MISSED" ? "Bajarilmadi deb belgilandi" : "Holat qaytarildi");
      onChanged();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <Card className="overflow-hidden border-brand/30">
      <div className="bg-gradient-to-br from-brand/15 via-brand/5 to-transparent px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand">Bugungi navbatchilar</p>
            <h2 className="mt-1 text-xl font-semibold capitalize sm:text-2xl">{dayLong(data.today)}</h2>
          </div>
          <Badge tone="brand" className="text-sm">{data.todayDuty.length || 0} / 2</Badge>
        </div>

        {!data.todayDuty.length ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 font-medium">{data.isDutyDay ? "Bugun navbatchi tayinlanmagan" : "Bugun navbatchilik kuni emas"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.isDutyDay ? "Navbat ro'yxatida faol o'quvchi yo'q. O'quvchilar bo'limidan o'quvchi qo'shing." : data.next ? `Keyingi navbatchilik: ${dayLong(data.next.date)}` : "Navbatchilik kunlari sozlanmagan."}
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.todayDuty.map((d) => (
              <div key={d.id} className={cn("rounded-2xl border bg-card p-4 shadow-sm", d.status === "DONE" ? "border-success/40" : d.status === "MISSED" ? "border-destructive/40" : "border-border")}>
                <div className="flex items-center gap-3">
                  <Avatar name={d.name} src={d.photoUrl} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-lg font-semibold leading-tight">{d.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={DUTY_STATUS_TONE[d.status]}>{DUTY_STATUS_LABEL[d.status]}</Badge>
                      {d.manual && <Badge tone="warning">Qo'lda{d.replacedName ? ` (${d.replacedName} o'rniga)` : ""}</Badge>}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {data.tasks.map((t, i) => {
                    const Icon = TASK_ICONS[i] ?? ClipboardList;
                    return (
                      <li key={t} className="flex items-center gap-2.5 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", d.status === "DONE" ? "bg-success/20 text-success" : "bg-brand/15 text-brand")}>
                          {d.status === "DONE" ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        </span>
                        <span className="font-medium">{i + 1}. {t}</span>
                      </li>
                    );
                  })}
                </ul>
                {d.markedAt && d.status !== "ASSIGNED" && <p className="mt-2 text-xs text-muted-foreground">{d.markedByName ?? "Administrator"} · {fmtDateTime(d.markedAt)}</p>}
                {admin && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {d.status !== "DONE" && <Button size="sm" onClick={() => setStatus(d.id, "DONE")} loading={busy === d.id + "DONE"}><CheckCircle2 className="h-4 w-4" /> Bajarildi</Button>}
                    {d.status === "ASSIGNED" && <Button size="sm" variant="outline" onClick={() => setStatus(d.id, "MISSED")} loading={busy === d.id + "MISSED"}><X className="h-4 w-4" /> Bajarilmadi</Button>}
                    {d.status !== "ASSIGNED" && <Button size="sm" variant="ghost" onClick={() => setStatus(d.id, "ASSIGNED")} loading={busy === d.id + "ASSIGNED"}><RotateCcw className="h-4 w-4" /> Qaytarish</Button>}
                    <Button size="sm" variant="outline" onClick={() => setReplace(d)}><Repeat className="h-4 w-4" /> Almashtirish</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Ikkala navbatchi ham ikkala vazifani bajaradi: {data.tasks.map((t, i) => `${i + 1}) ${t}`).join(", ")}.</p>
      </div>
      <ReplaceDialog item={replace} onClose={() => setReplace(null)} onDone={() => { setReplace(null); onChanged(); }} />
    </Card>
  );
}

function ReplaceDialog({ item, onClose, onDone }: { item: DutyOverview["todayDuty"][number] | null; onClose: () => void; onDone: () => void }) {
  const { data, error, isLoading } = useApi<{ items: DutyPerson[] }>(item ? `/api/duty/${item.id}/candidates` : null);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!item || !pick) return;
    setBusy(true);
    try {
      await api(`/api/duty/${item.id}/replace`, { method: "POST", body: { studentId: pick, note: note.trim() || undefined } });
      toast.success("Navbatchi almashtirildi");
      setPick("");
      setNote("");
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title="Navbatchini almashtirish"
      description={item ? `${item.name} o'rniga. Adolat uchun faqat shu aylanishda hali navbat kelmagan o'quvchilar ko'rsatiladi.` : undefined}
      footer={<><Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button onClick={submit} loading={busy} disabled={!pick}>Almashtirish</Button></>}
    >
      <div className="space-y-3">
        {error ? <ErrorState message={errMsg(error)} /> : isLoading || !data ? <Skeleton className="h-32" /> : !data.items.length ? (
          <p className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">Adolatli almashtirish uchun nomzod yo'q: boshqa hamma o'quvchi bu aylanishda allaqachon navbatchi bo'lgan. Agar o'quvchi kelmagan bo'lsa, «Bajarilmadi» deb belgilang — uning navbati keyingi kunga qoladi.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {data.items.map((c) => (
              <li key={c.studentId}>
                <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2", pick === c.studentId ? "border-brand bg-brand/10" : "border-border")}>
                  <input type="radio" name="cand" className="accent-[hsl(var(--brand))]" checked={pick === c.studentId} onChange={() => setPick(c.studentId)} />
                  <Avatar name={c.name} src={c.photoUrl} size={30} />
                  <span className="text-sm font-medium">{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Field label="Izoh (ixtiyoriy)"><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: kasal bo'lgani uchun" /></Field>
      </div>
    </Dialog>
  );
}

function ProgressCard({ p, lastDone }: { p: DutyOverview["progress"]; lastDone: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aylanish jarayoni</CardTitle>
        <CardDescription>Hamma navbatchi bo'lmaguncha ro'yxat boshidan boshlanmaydi</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <span className="text-4xl font-bold tabular-nums">{p.percent}%</span>
          <span className="pb-1 text-sm text-muted-foreground tabular-nums">{p.served} / {p.active} o'quvchi</span>
        </div>
        <Progress value={p.percent} tone={p.percent >= 75 ? "success" : "brand"} className="h-3" />
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-secondary/60 p-2"><dt className="text-[11px] text-muted-foreground">Bajargan</dt><dd className="text-lg font-semibold tabular-nums">{p.served}</dd></div>
          <div className="rounded-xl bg-secondary/60 p-2"><dt className="text-[11px] text-muted-foreground">Qolgan</dt><dd className="text-lg font-semibold tabular-nums">{p.pending}</dd></div>
          <div className="rounded-xl bg-secondary/60 p-2"><dt className="text-[11px] text-muted-foreground">Tugagan aylanish</dt><dd className="text-lg font-semibold tabular-nums">{p.completedRounds}</dd></div>
        </dl>
        {lastDone && <p className="text-xs text-muted-foreground">Oxirgi tasdiqlangan: {fmtDate(lastDone)}</p>}
      </CardContent>
    </Card>
  );
}

function PersonList({ items, empty, numbered }: { items: (DutyPerson & { order?: number; isToday?: boolean })[]; empty: string; numbered?: boolean }) {
  if (!items.length) return <EmptyState icon={Users} title={empty} className="py-8" />;
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {items.map((p, i) => (
        <li key={p.studentId} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
          {numbered && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums">{p.order ?? i + 1}</span>}
          <Avatar name={p.name} src={p.photoUrl} size={32} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
          {p.isToday && <Badge tone="brand">Bugun</Badge>}
        </li>
      ))}
    </ol>
  );
}

function HistoryTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { data, error, isLoading, mutate } = useApi<HistoryRes>(`/api/duty/history${qs({ page, pageSize: 20, status: status || undefined })}`);
  if (error && !data) return <ErrorState message={errMsg(error)} onRetry={() => mutate()} />;
  // sanalar bo'yicha guruhlash
  const groups = new Map<string, HistoryRes["items"]>();
  for (const it of data?.items ?? []) groups.set(it.date, [...(groups.get(it.date) ?? []), it]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {[["", "Hammasi"], ["DONE", "Bajarilgan"], ["ASSIGNED", "Tasdiqlanmagan"], ["MISSED", "Bajarilmagan"]].map(([v, l]) => (
          <Button key={v} size="sm" variant={status === v ? "default" : "outline"} onClick={() => { setStatus(v); setPage(1); }}>{l}</Button>
        ))}
      </div>
      {isLoading && !data ? <Skeleton className="h-48" /> : !data?.items.length ? <EmptyState icon={History} title="Tarix hali bo'sh" description="Navbatchilar har kuni avtomatik tayinlanadi." className="py-8" /> : (
        <div className="space-y-3">
          {[...groups.entries()].map(([date, rows]) => (
            <Card key={date} className="p-3">
              <p className="mb-2 text-sm font-semibold capitalize">{dayMid(date)}</p>
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Avatar name={r.name} src={r.photoUrl} size={30} />
                    <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{r.name}</span>
                    {r.manual && <Badge tone="warning" title={r.replacedName ? `${r.replacedName} o'rniga` : undefined}>Qo'lda</Badge>}
                    <Badge tone={DUTY_STATUS_TONE[r.status]}>{DUTY_STATUS_LABEL[r.status]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function ManageTab({ data, onChanged }: { data: DutyOverview; onChanged: () => void }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState<number[] | null>(null);
  const weekdays = days ?? data.settings.weekdays;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const move = (idx: number, dir: -1 | 1) => {
    const ids = data.queue.map((q) => q.studentId);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    run(() => api("/api/duty/members/order", { method: "PUT", body: { action: "set", order: ids } }), "Tartib saqlandi");
  };
  const alpha = async () => {
    const ok = await confirm({ title: "Alifbo tartibiga qaytarish", description: "Navbat ro'yxati A→Z tartibiga qaytariladi. Tayinlangan kunlar va hisob o'zgarmaydi, faqat hali navbat kelmaganlar orasidagi ketma-ketlik o'zgaradi." });
    if (ok) run(() => api("/api/duty/members/order", { method: "PUT", body: { action: "alphabetical" } }), "Alifbo tartibi tiklandi");
  };
  const toggle = async (id: string, name: string, enabled: boolean) => {
    if (!enabled) {
      const ok = await confirm({ title: "Navbatchilikdan chiqarish", description: `${name} navbatchilik ro'yxatidan vaqtincha chiqariladi. Tarixi saqlanadi. Qaytarilganda hisobi joriy aylanishga tenglanadi.`, destructive: true });
      if (!ok) return;
    }
    run(() => api(`/api/duty/members/${id}`, { method: "PATCH", body: { enabled } }), enabled ? "Qaytarildi" : "Chiqarildi");
  };
  const saveDays = () => run(async () => { await api("/api/duty/settings", { method: "PATCH", body: { weekdays } }); setDays(null); }, "Kunlar saqlandi");
  const toggleDay = (d: number) => setDays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort());
  const dirty = days !== null && JSON.stringify([...days].sort()) !== JSON.stringify([...data.settings.weekdays].sort());

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Navbatchilik kunlari</CardTitle><CardDescription>Tanlangan kunlarda har kuni avtomatik 2 nafar navbatchi tayinlanadi.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAY_SHORT.map((l, i) => (
              <button key={l} type="button" onClick={() => toggleDay(i + 1)} aria-pressed={weekdays.includes(i + 1)} className={cn("h-10 rounded-lg border text-xs font-medium transition-colors sm:text-sm", weekdays.includes(i + 1) ? "border-brand bg-brand text-white" : "border-border bg-card hover:bg-accent")}>{l}</button>
            ))}
          </div>
          {dirty && <Button size="sm" onClick={saveDays} loading={busy} disabled={!weekdays.length}>Saqlash</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div><CardTitle className="flex items-center gap-2"><ListOrdered className="h-4 w-4" /> Navbat tartibi</CardTitle><CardDescription>Bir xil hisobdagilar orasida tepadagi birinchi tanlanadi.</CardDescription></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={alpha} disabled={busy}><RotateCcw className="h-4 w-4" /> Alifbo bo'yicha</Button>
            <Link href="/students" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-accent"><UserPlus className="h-4 w-4" /> O'quvchi qo'shish</Link>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">O'quvchi qo'shish yoki arxivlash «O'quvchilar» bo'limida bajariladi — navbat ro'yxati avtomatik yangilanadi. Yangi o'quvchi alifbo bo'yicha tegishli joyga qo'yiladi va joriy aylanishga tenglanadi.</p>
          <ul className="space-y-1.5">
            {data.queue.map((q, i) => (
              <li key={q.studentId} className={cn("flex items-center gap-2 rounded-xl border border-border px-2 py-1.5", !q.enabled && "opacity-60")}>
                <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <Avatar name={q.name} src={q.photoUrl} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.name}</span>
                <Badge tone={STATE_TONE[q.state]} className="hidden sm:inline-flex">{STATE_LABEL[q.state]}</Badge>
                <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline" title="Navbatchilik soni">{q.count}×</span>
                <Button size="icon-sm" variant="ghost" aria-label="Yuqoriga" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Pastga" disabled={busy || i === data.queue.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={q.enabled ? "Ro'yxatdan chiqarish" : "Ro'yxatga qaytarish"} disabled={busy} onClick={() => toggle(q.studentId, q.name, !q.enabled)}>
                  {q.enabled ? <UserMinus className="h-4 w-4 text-destructive" /> : <UserPlus className="h-4 w-4 text-success" />}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function DutyView() {
  const { me } = useMe();
  const admin = me?.user.role === "ADMIN";
  const { data, error, isLoading, mutate } = useApi<DutyOverview>("/api/duty", { refreshInterval: 5 * 60_000, revalidateOnFocus: true });
  const [tab, setTab] = useState("pending");

  const changed = () => { mutate(); revalidatePrefix("/api/duty", "/api/dashboard"); };

  if (error && !data) return <Card><ErrorState message={errMsg(error)} onRetry={() => mutate()} /></Card>;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-72" />
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div>
      </div>
    );
  }

  const tabs = [
    { value: "pending", label: "Hali qilmaganlar", badge: <Badge>{data.pending.length}</Badge> },
    { value: "served", label: "Bajarganlar", badge: <Badge>{data.served.length}</Badge> },
    { value: "history", label: "Tarix" },
    ...(admin ? [{ value: "manage", label: "Boshqaruv" }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Navbatchilar" description="Har kuni 2 nafar o'quvchi alifbo tartibida avtomatik tayinlanadi" />

      <TodayCard data={data} admin={admin} onChanged={changed} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {data.next?.isTomorrow ? "Ertangi navbatchilar" : "Keyingi navbatchilar"}</CardTitle>
            {data.next && <CardDescription className="capitalize">{dayLong(data.next.date)} · taxminiy, navbat tartibi o'zgarmasa</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {data.next ? <Names people={data.next.students} /> : <p className="text-sm text-muted-foreground">Navbatchilik kunlari sozlanmagan.</p>}
            {data.upcoming.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Navbatdagilar</p>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {data.upcoming.map((u) => (
                    <li key={u.date} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                      <span className="w-28 shrink-0 text-xs font-medium capitalize text-muted-foreground">{dayMid(u.date)}</span>
                      <span className="min-w-0 flex-1 text-sm">{u.students.map((s) => s.name).join(" · ") || "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <ProgressCard p={data.progress} lastDone={data.stats.lastDoneDate} />
      </div>

      <Tabs value={tab} onChange={setTab} items={tabs} />
      {tab === "pending" && (
        <Card><CardContent className="pt-5">
          <p className="mb-3 text-sm text-muted-foreground">Joriy aylanishda hali navbatchi bo'lmagan o'quvchilar (navbat tartibida).</p>
          <PersonList items={data.pending} numbered empty="Hamma navbatchi bo'lgan — yangi aylanish boshlandi" />
        </CardContent></Card>
      )}
      {tab === "served" && (
        <Card><CardContent className="pt-5">
          <p className="mb-3 text-sm text-muted-foreground">Joriy aylanishda navbatchi bo'lib bo'lganlar. Aylanish tugamaguncha ular qayta tanlanmaydi.</p>
          <PersonList items={data.served} empty="Bu aylanishda hali hech kim navbatchi bo'lmagan" />
        </CardContent></Card>
      )}
      {tab === "history" && <HistoryTab />}
      {tab === "manage" && admin && <ManageTab data={data} onChanged={changed} />}
    </div>
  );
}
