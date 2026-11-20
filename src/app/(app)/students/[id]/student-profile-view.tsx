"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Archive, ArchiveRestore, ArrowLeft, CalendarCheck, CheckCircle2, ClipboardList, Pencil, Phone, Send, Timer, Trash2, UserX } from "lucide-react";
import { api, errMsg, useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/providers";
import { fmtDate, fmtDateTime, pct, timeAgo } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/data";
import { Avatar, Badge, EmptyState, ErrorState, Progress, Skeleton } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { C, ChartBox, ChartTooltip, axisProps } from "@/components/shared/charts";
import { StudentFormDialog } from "@/components/shared/student-form-dialog";

type Profile = {
  student: { id: string; studentCode: string; fullName: string; photoUrl: string | null; dateOfBirth: string | null; phone: string | null; parentPhone: string | null; enrolledAt: string; notes: string | null; status: "ACTIVE" | "ARCHIVED"; className: string };
  attendance: { counts: Record<"PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "ESCAPED", number>; rate: number | null; total: number };
  absences: { id: string; date: string; status: string; note: string | null }[];
  lates: { id: string; date: string; status: string; note: string | null }[];
  monthly: { month: string; rate: number | null }[];
  duty: { count: number; items: { id: string; date: string; status: "ASSIGNED" | "DONE" | "MISSED"; manual: boolean }[] };
  notes: { id: string; body: string; createdAt: string; author: string }[];
};

const DUTY_STATUS: Record<string, string> = { ASSIGNED: "Belgilangan", DONE: "Bajarildi", MISSED: "Bajarilmadi" };

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

export function StudentProfileView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const { me } = useMe();
  const { data, error, isLoading, mutate } = useApi<Profile>(`/api/students/${id}`);
  const [tab, setTab] = useState("info");
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  if (error && !data) return <Card><ErrorState message={errMsg(error)} onRetry={() => mutate()} /></Card>;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  const { student: s, attendance: a, duty: d } = data;
  const archived = s.status === "ARCHIVED";

  const setStatus = async () => {
    const ok = await confirm({
      title: archived ? "Arxivdan qaytarish" : "Arxivlash",
      description: archived ? `${s.fullName} faol ro'yxatga qaytariladi.` : `${s.fullName} arxivga o'tkaziladi. Barcha ma'lumotlari saqlanadi.`,
      destructive: !archived,
    });
    if (!ok) return;
    try {
      if (archived) await api(`/api/students/${s.id}`, { method: "PATCH", body: { ...s, photoUrl: s.photoUrl ?? "", status: "ACTIVE" } });
      else await api(`/api/students/${s.id}`, { method: "DELETE" });
      toast.success(archived ? "Qaytarildi" : "Arxivlandi");
      mutate();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const purge = async () => {
    const ok = await confirm({ title: "Butunlay o'chirish", description: `${s.fullName} va unga tegishli barcha davomat, baho va yutuqlar BUTUNLAY o'chiriladi. Bu amalni qaytarib bo'lmaydi.`, confirmText: "Butunlay o'chirish", destructive: true });
    if (!ok) return;
    try {
      await api(`/api/students/${s.id}?permanent=1`, { method: "DELETE" });
      toast.success("O'chirildi");
      router.replace("/students");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await api(`/api/students/${s.id}/notes`, { body: { body: note } });
      setNote("");
      mutate();
      toast.success("Izoh qo'shildi");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const monthly = data.monthly.map((m) => ({ label: fmtDate(m.month + "-01", "MMM yy"), rate: m.rate ?? 0 }));

  return (
    <div className="space-y-5">
      <Link href="/students" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> O'quvchilar
      </Link>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={s.fullName} src={s.photoUrl} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{s.fullName}</h1>
              <Badge tone={archived ? "outline" : "success"}>{archived ? "Arxivda" : "Faol"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              ID: <span className="font-mono">{s.studentCode}</span> · Sinf: {s.className} · Qabul: {fmtDate(s.enrolledAt)}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{s.phone}</a>}
              {s.parentPhone && <a href={`tel:${s.parentPhone}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="h-3.5 w-3.5" />Ota-ona: {s.parentPhone}</a>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Tahrirlash</Button>
            <Button variant="outline" size="sm" onClick={setStatus}>{archived ? <><ArchiveRestore className="h-4 w-4" /> Qaytarish</> : <><Archive className="h-4 w-4" /> Arxivlash</>}</Button>
            {me?.user.role === "ADMIN" && <Button variant="destructive" size="sm" onClick={purge}><Trash2 className="h-4 w-4" /> O'chirish</Button>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Davomat" value={pct(a.rate)} icon={CalendarCheck} tone={a.rate != null && a.rate < 80 ? "warning" : "success"} hint={`${a.total} kun belgilangan`} />
        <StatCard label="Kelmagan kunlar" value={a.counts.ABSENT + a.counts.EXCUSED + a.counts.ESCAPED} icon={UserX} tone="danger" hint={`Sababli: ${a.counts.EXCUSED}`} />
        <StatCard label="Kechikishlar" value={a.counts.LATE} icon={Timer} tone="warning" />
        <StatCard label="Navbatchilik" value={d.count} icon={ClipboardList} tone="info" hint="marta navbatchi bo'lgan" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "info", label: "Ma'lumotlar" },
          { value: "attendance", label: "Davomat" },
          { value: "duty", label: "Navbatchilik", badge: d.items.length ? <Badge tone="brand">{d.items.length}</Badge> : undefined },
          { value: "notes", label: "Izohlar", badge: data.notes.length ? <Badge>{data.notes.length}</Badge> : undefined },
        ]}
      />

      {tab === "info" && (
        <Card>
          <CardHeader><CardTitle>Shaxsiy ma'lumotlar</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="To'liq ism" value={s.fullName} />
              <Info label="O'quvchi ID" value={<span className="font-mono">{s.studentCode}</span>} />
              <Info label="Tug'ilgan sana" value={s.dateOfBirth ? fmtDate(s.dateOfBirth) : null} />
              <Info label="Telefon" value={s.phone} />
              <Info label="Ota-ona telefoni" value={s.parentPhone} />
              <Info label="Qabul sanasi" value={fmtDate(s.enrolledAt)} />
              <div className="sm:col-span-2 lg:col-span-3"><Info label="Qo'shimcha ma'lumot" value={s.notes} /></div>
            </dl>
          </CardContent>
        </Card>
      )}

      {tab === "attendance" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Oylik davomat</CardTitle></CardHeader>
            <CardContent>
              {!monthly.length ? <p className="py-8 text-center text-sm text-muted-foreground">Davomat ma'lumoti yo'q</p> : (
                <ChartBox height={220}>
                  <ResponsiveContainer>
                    <LineChart data={monthly} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="label" {...axisProps} />
                      <YAxis domain={[0, 100]} {...axisProps} />
                      <Tooltip content={<ChartTooltip suffix="%" nameMap={{ rate: "Davomat" }} />} />
                      <Line type="monotone" dataKey="rate" stroke={C.brand} strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartBox>
              )}
            </CardContent>
          </Card>
          {[
            { title: "Kelmagan kunlar", rows: data.absences, tone: "danger" as const },
            { title: "Kechikishlar", rows: data.lates, tone: "warning" as const },
          ].map((blk) => (
            <Card key={blk.title}>
              <CardHeader><CardTitle>{blk.title}</CardTitle></CardHeader>
              <CardContent>
                {!blk.rows.length ? <EmptyState icon={CheckCircle2} title="Yozuv yo'q" className="py-6" /> : (
                  <ul className="divide-y divide-border">
                    {blk.rows.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span>{fmtDate(r.date, "d MMMM yyyy, EEE")}</span>
                        <span className="flex items-center gap-2">
                          {r.note && <span className="max-w-[10rem] truncate text-xs text-muted-foreground">{r.note}</span>}
                          <Badge tone={r.status === "EXCUSED" ? "info" : blk.tone}>{r.status === "EXCUSED" ? "Sababli" : r.status === "ABSENT" ? "Kelmadi" : r.status === "ESCAPED" ? "Qochib ketdi" : "Kechikdi"}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "duty" && (
        <Card>
          <CardHeader><CardTitle>Navbatchilik tarixi</CardTitle></CardHeader>
          <CardContent>
            {!d.items.length ? <EmptyState icon={ClipboardList} title="Hali navbatchi bo'lmagan" className="py-6" /> : (
              <ul className="divide-y divide-border">
                {d.items.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-medium">{fmtDate(x.date)}</span>
                    <span className="flex items-center gap-2">
                      {x.manual && <Badge>Qo'lda</Badge>}
                      <Badge tone={x.status === "DONE" ? "success" : x.status === "MISSED" ? "danger" : "info"}>{DUTY_STATUS[x.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "notes" && (
        <Card>
          <CardHeader><CardTitle>O'qituvchi izohlari</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Yangi izoh yozing…" maxLength={2000} className="min-h-[72px]" />
              <Button onClick={addNote} loading={sending} disabled={!note.trim()} className="sm:self-end"><Send className="h-4 w-4" /> Qo'shish</Button>
            </div>
            {!data.notes.length ? <p className="py-4 text-center text-sm text-muted-foreground">Izohlar yo'q</p> : (
              <ul className="space-y-3">
                {data.notes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-muted p-3">
                    <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">{n.author} · {timeAgo(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <StudentFormDialog open={edit} onClose={() => setEdit(false)} student={s} onSaved={() => mutate()} />
    </div>
  );
}
