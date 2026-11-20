"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, XAxis, YAxis, Tooltip } from "recharts";
import { ResponsiveContainer } from "recharts";
import { AlertCircle, CalendarClock, CalendarX, CheckCircle2, Clock, LayoutGrid, RefreshCw, SlidersHorizontal, UserCheck, UserX, Users, Timer } from "lucide-react";
import { api, errMsg, qs, useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/providers";
import { fmtDate, fmtDateTime, pct, timeAgo } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader, StatCard } from "@/components/ui/data";
import { Avatar, Badge, EmptyState, ErrorState, PRIORITY_TONE, Progress, Skeleton } from "@/components/ui/feedback";
import { Input, Switch } from "@/components/ui/form";
import { C, ChartBox, ChartTooltip, STATUS_COLOR, axisProps } from "@/components/shared/charts";
import { cn } from "@/lib/utils";
import { DutyWidget } from "@/components/shared/duty-widget";

type Dash = {
  range: { from: string; to: string };
  today: string;
  stats: {
    totalStudents: number; presentToday: number; absentToday: number; lateToday: number; excusedToday: number; notMarkedToday: number;
    averageAttendance: number | null; upcomingExams: number;
  };
  charts: {
    weekly: { date: string; PRESENT: number; LATE: number; ABSENT: number; EXCUSED: number; ESCAPED: number }[];
    monthly: { month: string; rate: number | null }[];
    distribution: { status: string; count: number }[];
  };
  widgets: {
    todayTimetable: { weekday: number; currentId: string | null; nextId: string | null; lessons: { id: string; lessonNumber: number; subject: string; teacherName: string; room: string | null; startTime: string; endTime: string }[] };
    upcomingExams: { id: string; title: string; type: string; startsAt: string; allDay: boolean }[];
    recentAnnouncements: { id: string; title: string; excerpt: string; priority: string; pinned: boolean; publishAt: string }[];
    recentActivity: { id: string; userName: string; action: string; description: string; createdAt: string }[];
    needsAttention: { id: string; fullName: string; studentCode: string; photoUrl: string | null; reasons: string[] }[];
    upcomingDeadlines: { id: string; kind: "event"; title: string; subject: string | null; at: string; completed: number | null; total: number | null; link: string }[];
  };
  scale: { attendanceAlertPercent: number };
};

const STATUS_LABEL: Record<string, string> = { PRESENT: "Keldi", ABSENT: "Kelmadi", LATE: "Kechikdi", EXCUSED: "Sababli", ESCAPED: "Qochib ketdi" };

const WIDGETS: { key: string; label: string; group: "Grafiklar" | "Vidjetlar" }[] = [
  { key: "chart-weekly", label: "Haftalik davomat", group: "Grafiklar" },
  { key: "chart-monthly", label: "Oylik davomat", group: "Grafiklar" },
  { key: "chart-distribution", label: "Davomat taqsimoti", group: "Grafiklar" },
  { key: "w-timetable", label: "Bugungi jadval", group: "Vidjetlar" },
  { key: "w-exams", label: "Yaqin imtihonlar", group: "Vidjetlar" },
  { key: "w-announcements", label: "So'nggi e'lonlar", group: "Vidjetlar" },
  { key: "w-activity", label: "So'nggi faollik", group: "Vidjetlar" },
  { key: "w-attention", label: "E'tibor talab qiladigan o'quvchilar", group: "Vidjetlar" },
  { key: "w-deadlines", label: "Yaqin muddatlar", group: "Vidjetlar" },
  { key: "w-duty", label: "Bugungi navbatchilar", group: "Vidjetlar" },
];

const addDaysStr = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const dayShort = (d: string) => fmtDate(d, "EEE d");

function Panel({ title, desc, children, action, className }: { title: string; desc?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {desc && <CardDescription className="mt-0.5">{desc}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

export function DashboardView() {
  const { me, refresh } = useMe();
  const hidden = new Set(me?.settings.hiddenWidgets ?? []);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [preset, setPreset] = useState("30");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const { data, error, isLoading, isValidating, mutate } = useApi<Dash>(`/api/dashboard${qs(range)}`, { refreshInterval: 60_000 });

  const applyPreset = (p: string) => {
    setPreset(p);
    const today = data?.today;
    if (p === "custom") return;
    if (!today) return setRange({});
    if (p === "week") {
      const wd = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
      setRange({ from: addDaysStr(today, -wd), to: today });
    } else if (p === "month") setRange({ from: today.slice(0, 8) + "01", to: today });
    else setRange({ from: addDaysStr(today, -29), to: today });
  };

  const openCustomize = () => {
    setDraft(new Set(hidden));
    setOpen(true);
  };
  const saveCustomize = async () => {
    setSaving(true);
    try {
      await api("/api/settings/user", { method: "PATCH", body: { hiddenWidgets: [...draft] } });
      refresh();
      setOpen(false);
      toast.success("Vidjetlar saqlandi");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const s = data?.stats;
  const show = (k: string) => !hidden.has(k);

  const weekly = useMemo(() => data?.charts.weekly.map((w) => ({ ...w, label: dayShort(w.date) })) ?? [], [data]);
  const monthly = useMemo(() => data?.charts.monthly.map((m) => ({ ...m, label: fmtDate(m.month + "-01", "MMM"), rate: m.rate ?? 0 })) ?? [], [data]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Boshqaruv paneli"
        description={me ? `${me.className} sinfi · ${data ? fmtDate(data.today, "d MMMM, EEEE") : "…"}` : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => mutate()} aria-label="Yangilash">
              <RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} /> Yangilash
            </Button>
            {me?.user.role !== "GUEST" && (
              <Button variant="outline" size="sm" onClick={openCustomize}>
                <SlidersHorizontal className="h-4 w-4" /> Vidjetlar
              </Button>
            )}
          </>
        }
      />

      {/* Sana filtri */}
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {[["week", "Bu hafta"], ["30", "30 kun"], ["month", "Bu oy"], ["custom", "Boshqa"]].map(([v, l]) => (
            <Button key={v} size="sm" variant={preset === v ? "default" : "ghost"} onClick={() => applyPreset(v)}>
              {l}
            </Button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input type="date" className="w-auto" value={range.from ?? ""} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || undefined }))} />
            <span className="text-muted-foreground">—</span>
            <Input type="date" className="w-auto" value={range.to ?? ""} min={range.from} max={data?.today} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || undefined }))} />
          </div>
        )}
        {data && <p className="text-xs text-muted-foreground sm:ml-auto">Davr: {fmtDate(data.range.from)} — {fmtDate(data.range.to)}</p>}
      </Card>

      {error && !data ? (
        <Card>
          <ErrorState message={errMsg(error)} onRetry={() => mutate()} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <StatCard label="Jami o'quvchilar" value={s?.totalStudents} icon={Users} loading={isLoading} />
            <StatCard label="Bugun kelganlar" value={s?.presentToday} icon={UserCheck} tone="success" loading={isLoading} hint={s ? `${s.notMarkedToday} ta belgilanmagan` : undefined} />
            <StatCard label="Bugun kelmaganlar" value={s?.absentToday} icon={UserX} tone="danger" loading={isLoading} />
            <StatCard label="Bugun kechikkanlar" value={s?.lateToday} icon={Timer} tone="warning" loading={isLoading} />
            <StatCard label="O'rtacha davomat" value={pct(s?.averageAttendance)} icon={CheckCircle2} tone="info" loading={isLoading} />
            <StatCard label="Yaqin imtihonlar" value={s?.upcomingExams} icon={CalendarClock} tone="warning" loading={isLoading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {show("chart-weekly") && (
              <Panel title="Haftalik davomat" desc="Joriy hafta, kunlar bo'yicha">
                {isLoading ? <Skeleton className="h-60" /> : (
                  <ChartBox>
                    <ResponsiveContainer>
                      <BarChart data={weekly} margin={{ left: -20, right: 4, top: 8 }}>
                        <CartesianGrid vertical={false} stroke={C.grid} />
                        <XAxis dataKey="label" {...axisProps} />
                        <YAxis allowDecimals={false} {...axisProps} />
                        <Tooltip content={<ChartTooltip nameMap={STATUS_LABEL} />} cursor={{ fill: "hsl(var(--accent))" }} />
                        <Legend formatter={(v) => STATUS_LABEL[v] ?? v} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        {["PRESENT", "LATE", "EXCUSED", "ESCAPED", "ABSENT"].map((k) => (
                          <Bar key={k} dataKey={k} stackId="a" fill={STATUS_COLOR[k]} radius={k === "ABSENT" ? [4, 4, 0, 0] : 0} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartBox>
                )}
              </Panel>
            )}
            {show("chart-monthly") && (
              <Panel title="Oylik davomat" desc="So'nggi 6 oy, foizda">
                {isLoading ? <Skeleton className="h-60" /> : (
                  <ChartBox>
                    <ResponsiveContainer>
                      <AreaChart data={monthly} margin={{ left: -20, right: 8, top: 8 }}>
                        <defs>
                          <linearGradient id="mrate" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={C.brand} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={C.brand} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke={C.grid} />
                        <XAxis dataKey="label" {...axisProps} />
                        <YAxis domain={[0, 100]} {...axisProps} />
                        <Tooltip content={<ChartTooltip suffix="%" nameMap={{ rate: "Davomat" }} />} />
                        <Area type="monotone" dataKey="rate" stroke={C.brand} strokeWidth={2.5} fill="url(#mrate)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartBox>
                )}
              </Panel>
            )}
            {show("chart-distribution") && (
              <Panel title="Davomat taqsimoti" desc="Tanlangan davr">
                {isLoading ? <Skeleton className="h-60" /> : !data || data.charts.distribution.every((d) => d.count === 0) ? <Empty text="Davomat ma'lumoti yo'q" /> : (
                  <ChartBox>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={data.charts.distribution} dataKey="count" nameKey="status" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
                          {data.charts.distribution.map((d) => (
                            <Cell key={d.status} fill={STATUS_COLOR[d.status]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend formatter={(v) => STATUS_LABEL[v] ?? v} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartBox>
                )}
              </Panel>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {show("w-timetable") && (
              <Panel title="Bugungi jadval" action={<Link href="/timetable" className="text-xs font-medium text-brand hover:underline">Hammasi</Link>}>
                {isLoading ? <Skeleton className="h-40" /> : !data?.widgets.todayTimetable.lessons.length ? <EmptyState icon={Clock} title="Bugun dars yo'q" className="py-6" /> : (
                  <ul className="space-y-2">
                    {data.widgets.todayTimetable.lessons.map((l) => {
                      const cur = l.id === data.widgets.todayTimetable.currentId;
                      const nxt = l.id === data.widgets.todayTimetable.nextId;
                      return (
                        <li key={l.id} className={cn("flex items-center gap-3 rounded-xl border border-border px-3 py-2", cur && "border-brand bg-brand/10")}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold">{l.lessonNumber}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{l.subject}</span>
                            <span className="block truncate text-xs text-muted-foreground">{l.startTime}–{l.endTime}{l.room ? ` · ${l.room}-xona` : ""}</span>
                          </span>
                          {cur && <Badge tone="brand">Hozir</Badge>}
                          {nxt && <Badge tone="outline">Keyingi</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            )}
            {show("w-exams") && (
              <Panel title="Yaqin imtihonlar" action={<Link href="/calendar" className="text-xs font-medium text-brand hover:underline">Kalendar</Link>}>
                {isLoading ? <Skeleton className="h-40" /> : !data?.widgets.upcomingExams.length ? <EmptyState icon={CalendarX} title="Yaqin imtihon yo'q" className="py-6" /> : (
                  <ul className="space-y-2">
                    {data.widgets.upcomingExams.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                        <Badge tone={e.type === "EXAM" ? "danger" : "warning"}>{e.type === "EXAM" ? "Imtihon" : "Test"}</Badge>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{e.allDay ? fmtDate(e.startsAt) : fmtDateTime(e.startsAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {show("w-announcements") && (
              <Panel title="So'nggi e'lonlar" action={<Link href="/announcements" className="text-xs font-medium text-brand hover:underline">Hammasi</Link>}>
                {isLoading ? <Skeleton className="h-40" /> : !data?.widgets.recentAnnouncements.length ? <Empty text="E'lonlar yo'q" /> : (
                  <ul className="space-y-3">
                    {data.widgets.recentAnnouncements.map((a) => (
                      <li key={a.id}>
                        <Link href={`/announcements?focus=${a.id}`} className="block rounded-lg p-1 hover:bg-accent/50">
                          <div className="flex items-center gap-2">
                            <Badge tone={PRIORITY_TONE[a.priority]}>{a.priority === "URGENT" ? "Shoshilinch" : a.priority === "IMPORTANT" ? "Muhim" : "Oddiy"}</Badge>
                            <span className="truncate text-sm font-medium">{a.title}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.excerpt}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(a.publishAt)}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {show("w-attention") && (
              <Panel title="E'tibor talab qiladi" desc="Qo'llab-quvvatlash kerak bo'lgan o'quvchilar">
                {isLoading ? <Skeleton className="h-40" /> : !data?.widgets.needsAttention.length ? <EmptyState icon={CheckCircle2} title="Hammasi joyida" description="Hozircha alohida e'tibor talab qiladigan o'quvchi yo'q." className="py-6" /> : (
                  <ul className="space-y-2">
                    {data.widgets.needsAttention.map((st) => (
                      <li key={st.id}>
                        <Link href={`/students/${st.id}`} className="flex items-start gap-3 rounded-xl border border-border p-2.5 hover:bg-accent/50">
                          <Avatar name={st.fullName} src={st.photoUrl} size={34} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{st.fullName}</span>
                            {st.reasons.map((r) => (
                              <span key={r} className="flex items-center gap-1 text-xs text-muted-foreground"><AlertCircle className="h-3 w-3 shrink-0 text-warning" />{r}</span>
                            ))}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {show("w-deadlines") && (
              <Panel title="Yaqin muddatlar" action={<Link href="/calendar" className="text-xs font-medium text-brand hover:underline">Taqvim</Link>}>
                {isLoading ? <Skeleton className="h-40" /> : !data?.widgets.upcomingDeadlines.length ? <EmptyState icon={CalendarClock} title="Yaqin muddat yo'q" className="py-6" /> : (
                  <ul className="space-y-3">
                    {data.widgets.upcomingDeadlines.map((d) => (
                      <li key={d.id}>
                        <Link href={d.link} className="block">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{d.title}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(d.at)}</span>
                          </div>
                          {d.subject && <p className="text-xs text-muted-foreground">{d.subject}</p>}
                          {d.total ? <Progress className="mt-1.5" value={((d.completed ?? 0) / d.total) * 100} tone="success" /> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            {show("w-duty") && <DutyWidget />}
            {show("w-activity") && (
              <Panel title="So'nggi faollik" action={<Link href="/logs" className="text-xs font-medium text-brand hover:underline">Jurnal</Link>} className="md:col-span-2 xl:col-span-3">
                {isLoading ? <Skeleton className="h-32" /> : !data?.widgets.recentActivity.length ? <Empty text="Faollik yo'q" /> : (
                  <ul className="divide-y divide-border">
                    {data.widgets.recentActivity.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                        <span className="font-medium">{a.userName}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.description}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>

          {WIDGETS.every((w) => hidden.has(w.key)) && (
            <Card>
              <EmptyState icon={LayoutGrid} title="Barcha vidjetlar yashirilgan" description="“Vidjetlar” tugmasi orqali kerakli bo'limlarni qaytaring." />
            </Card>
          )}
        </>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Vidjetlarni sozlash"
        description="Panelda ko'rinadigan bo'limlarni tanlang. Tanlov hisobingizda saqlanadi."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Bekor qilish</Button>
            <Button onClick={saveCustomize} loading={saving}>Saqlash</Button>
          </>
        }
      >
        {(["Grafiklar", "Vidjetlar"] as const).map((g) => (
          <div key={g} className="mb-4 last:mb-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
            <ul className="space-y-1">
              {WIDGETS.filter((w) => w.group === g).map((w) => (
                <li key={w.key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent/50">
                  <span className="text-sm">{w.label}</span>
                  <Switch
                    label={w.label}
                    checked={!draft.has(w.key)}
                    onCheckedChange={(on) =>
                      setDraft((d) => {
                        const n = new Set(d);
                        if (on) n.delete(w.key);
                        else n.add(w.key);
                        return n;
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Dialog>
    </div>
  );
}
