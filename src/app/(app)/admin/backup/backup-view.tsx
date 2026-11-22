"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, DatabaseBackup, Download, Hourglass, Loader2, PlugZap, RotateCcw, ShieldAlert, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { api, downloadUrl, errMsg, useApi } from "@/lib/client/api";
import { fmtDateTime, timeAgo } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/data";
import { Dialog } from "@/components/ui/dialog";
import { Badge, EmptyState, ErrorState, ListSkeleton, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm";

type Item = {
  id: string; filename: string; kind: "DAILY" | "MANUAL" | "PRE_RESTORE"; status: "PENDING" | "VERIFYING" | "SUCCESS" | "FAILED";
  destination: "BACKUP_DB" | "PRIMARY"; sizeBytes: number; rawBytes: number; recordCount: number; checksum: string | null;
  verified: boolean; verifiedAt: string | null; error: string | null; createdAt: string; finishedAt: string | null;
  expiresAt: string | null; runDate: string | null; createdByName: string | null; restoredAt: string | null;
};
type Overview = {
  configured: boolean; sameAsPrimary: boolean;
  schedule: { cron: string; timezone: string; localTime: string; nextRunAt: string };
  lastSuccessAt: string | null; lastDailyAt: string | null; overdue: boolean; items: Item[];
  connection: { ok: boolean; latencyMs: number | null; error: string | null } | null; connectionError: string | null;
};

const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const KIND: Record<Item["kind"], string> = { DAILY: "Kunlik (avtomatik)", MANUAL: "Qo'lda", PRE_RESTORE: "Tiklashdan oldingi" };

const STATUS = {
  SUCCESS: { label: "SUCCESS", tone: "success", icon: CheckCircle2 },
  FAILED: { label: "FAILED", tone: "danger", icon: XCircle },
  PENDING: { label: "PENDING", tone: "warning", icon: Hourglass },
  VERIFYING: { label: "VERIFYING", tone: "info", icon: Loader2 },
} as const;

function StatusBadge({ status }: { status: Item["status"] }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone}>
      <Icon className={cn("h-3.5 w-3.5", status === "VERIFYING" && "animate-spin")} /> {s.label}
    </Badge>
  );
}

/** Qolgan saqlash muddati: "5 kun 3 soat" */
function remaining(expiresAt: string | null) {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "muddati tugagan (navbatdagi tozalashda o'chadi)";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d} kun ${h} soat` : `${h} soat`;
}

function InfoCard({ icon: Icon, label, value, hint, tone = "brand" }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "brand" | "success" | "danger" | "warning" }) {
  const cls = { brand: "bg-brand/15 text-brand", success: "bg-success/15 text-success", danger: "bg-destructive/15 text-destructive", warning: "bg-warning/20 text-warning" }[tone];
  return (
    <Card interactive className="p-4">
      <div className="flex items-start gap-3">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", cls)}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="t-label">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}

export function BackupView() {
  const confirm = useConfirm();
  const { data, error, isLoading, isValidating, mutate } = useApi<Overview>("/api/backups", { refreshInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [restore, setRestore] = useState<Item | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      await api("/api/backups", { method: "POST" });
      toast.success("Zaxira nusxa yaratildi va tekshiruvdan o'tdi");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      mutate();
    }
  };
  const check = async () => {
    setChecking(true);
    try {
      const r = await api<{ ok: boolean; latencyMs: number | null; error: string | null }>("/api/backups/status");
      if (r.ok) toast.success(`Zaxira bazasi bilan aloqa yaxshi (${r.latencyMs} ms)`);
      else toast.error(r.error ?? "Zaxira bazasiga ulanib bo'lmadi");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setChecking(false);
      mutate();
    }
  };
  const remove = async (b: Item) => {
    if (!(await confirm({ title: "Zaxirani o'chirish", description: `${b.filename} butunlay o'chiriladi.`, confirmText: "O'chirish", destructive: true }))) return;
    try {
      await api(`/api/backups/${b.id}`, { method: "DELETE" });
      toast.success("O'chirildi");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      mutate();
    }
  };

  const ready = !!data?.configured && !data.sameAsPrimary;
  const connOk = !!data?.connection?.ok;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Zaxira nusxalar"
        description="Har kuni 03:00 (Asia/Tashkent) avtomatik to'liq nusxa — alohida bazada, so'nggi 7 kun saqlanadi"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={check} loading={checking} disabled={!data?.configured}><PlugZap className="h-4 w-4" /> Ulanishni tekshirish</Button>
            <Button size="sm" onClick={create} loading={busy}><DatabaseBackup className="h-4 w-4" /> Zaxira yaratish</Button>
          </>
        }
      />

      {/* Ogohlantirishlar */}
      {data && !data.configured && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm animate-fade-up">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Avtomatik zaxira O'CHIQ — BACKUP_DATABASE_URL sozlanmagan</p>
            <p className="mt-1 text-foreground/80">Alohida PostgreSQL zaxira bazasi ulanmaguncha kunlik zaxira ishlamaydi. Qo'lda yaratilgan nusxalar faqat asosiy baza/Volume'da turadi — asosiy baza yo'qolsa, ular ham yo'qoladi. Sozlash: README → «Zaxira tizimi».</p>
          </div>
        </div>
      )}
      {data?.sameAsPrimary && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p><span className="font-semibold text-destructive">BACKUP_DATABASE_URL asosiy bazaga ishora qilmoqda.</span> Zaxira ALOHIDA bazada bo'lishi shart — boshqa (masalan, ikkinchi Neon loyihasi) baza manzilini kiriting.</p>
        </div>
      )}
      {ready && data?.connection && !connOk && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/15 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p><span className="font-semibold">Zaxira bazasiga ulanib bo'lmadi.</span> {data.connectionError}</p>
        </div>
      )}
      {ready && data?.overdue && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/15 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p><span className="font-semibold">Kunlik zaxira kechikmoqda.</span> Oxirgi muvaffaqiyatli avtomatik nusxa 26 soatdan eski. Railway'dagi Cron xizmati ishlayotganini va loglarini tekshiring.</p>
        </div>
      )}

      {error && !data ? (
        <Card><ErrorState message={errMsg(error)} onRetry={() => mutate()} /></Card>
      ) : (
        <>
          {/* Holat kartalari */}
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isLoading && !data ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
            ) : (
              <>
                <InfoCard
                  icon={ShieldCheck}
                  tone={!ready ? "danger" : data?.overdue ? "warning" : "success"}
                  label="Avtomatik zaxira"
                  value={!ready ? "O'CHIQ" : data?.overdue ? "KECHIKMOQDA" : "YOQILGAN"}
                  hint={ready ? `Cron: ${data?.schedule.cron} (UTC)` : "Zaxira bazasi ulanmagan"}
                />
                <InfoCard
                  icon={CheckCircle2}
                  tone={data?.lastSuccessAt ? "success" : "warning"}
                  label="Oxirgi muvaffaqiyatli"
                  value={data?.lastSuccessAt ? fmtDateTime(data.lastSuccessAt) : "Hali yo'q"}
                  hint={data?.lastSuccessAt ? timeAgo(data.lastSuccessAt) : undefined}
                />
                <InfoCard
                  icon={CalendarClock}
                  label="Keyingi rejalashtirilgan"
                  value={ready && data ? fmtDateTime(data.schedule.nextRunAt) : "—"}
                  hint={data ? `Har kuni ${data.schedule.localTime}, ${data.schedule.timezone}` : undefined}
                />
                <InfoCard
                  icon={DatabaseBackup}
                  tone={!data?.configured || data?.sameAsPrimary ? "danger" : connOk ? "success" : "warning"}
                  label="Zaxira bazasi"
                  value={!data?.configured ? "Ulanmagan" : data.sameAsPrimary ? "Noto'g'ri" : connOk ? "Ulangan" : "Aloqa yo'q"}
                  hint={connOk && data?.connection?.latencyMs != null ? `Javob: ${data.connection.latencyMs} ms${isValidating ? " · yangilanmoqda" : ""}` : undefined}
                />
              </>
            )}
          </div>

          {/* Tarix */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div>
                <h2 className="t-section">Zaxiralar tarixi</h2>
                <p className="text-xs text-muted-foreground">Kunlik nusxalardan eng yangi 7 tasi saqlanadi; eskilari avtomatik o'chadi</p>
              </div>
              <Image src="/images/backup-shield.webp" alt="" width={120} height={73} className="hidden h-auto w-28 sm:block" />
            </div>
            {isLoading && !data ? (
              <ListSkeleton rows={4} />
            ) : !data?.items.length ? (
              <EmptyState icon={DatabaseBackup} title="Zaxira nusxalar yo'q" description="Birinchi zaxirani yarating yoki kunlik avtomatik nusxani kuting." />
            ) : (
              <ul className="divide-y divide-border">
                {data.items.map((b) => {
                  const ok = b.status === "SUCCESS";
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:px-5">
                      <div className="min-w-0 flex-1 basis-64 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={b.status} />
                          <Badge tone={b.kind === "DAILY" ? "brand" : "outline"}>{KIND[b.kind]}</Badge>
                          {b.destination === "PRIMARY" && <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> Asosiy bazada (himoyasiz)</Badge>}
                          {ok && (b.verified ? <Badge tone="success"><ShieldCheck className="h-3 w-3" /> Tekshirilgan</Badge> : <Badge tone="warning">Tekshirilmagan</Badge>)}
                        </div>
                        <p className="truncate text-sm font-medium">{b.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDateTime(b.createdAt)} · {b.createdByName ?? "Tizim"} · {size(b.sizeBytes)} · {b.recordCount} yozuv
                        </p>
                        {ok && b.expiresAt && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Muddati: {fmtDateTime(b.expiresAt)} · qoldi: {remaining(b.expiresAt)}</p>
                        )}
                        {b.checksum && <p className="truncate font-mono text-[10px] text-muted-foreground">SHA-256: {b.checksum}</p>}
                        {b.error && <p className="text-xs text-destructive">{b.error}</p>}
                        {b.restoredAt && <p className="text-xs text-muted-foreground">Tiklangan: {fmtDateTime(b.restoredAt)}</p>}
                      </div>
                      <div className="flex">
                        <Button size="icon-sm" variant="ghost" aria-label="Yuklab olish" disabled={!ok || !b.verified} onClick={() => downloadUrl(`/api/backups/${b.id}`)}><Download className="h-4 w-4" /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Tiklash" disabled={!ok || !b.verified} onClick={() => setRestore(b)}><RotateCcw className="h-4 w-4" /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="O'chirish" onClick={() => remove(b)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
      <RestoreDialog backup={restore} onClose={() => setRestore(null)} onDone={() => { setRestore(null); mutate(); }} />
    </div>
  );
}

function RestoreDialog({ backup, onClose, onDone }: { backup: Item | null; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      const r = await api<{ skippedUsers?: string[]; safetyBackup?: string }>(`/api/backups/${backup.id}`, { body: { confirm: "RESTORE" } });
      toast.success(r.skippedUsers?.length ? `Tiklandi. O'tkazib yuborilgan foydalanuvchilar: ${r.skippedUsers.length}` : "Ma'lumotlar tiklandi");
      setText("");
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!backup} onClose={onClose} title="Zaxiradan tiklash" description={backup?.filename} footer={<><Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button variant="destructive" onClick={run} loading={busy} disabled={text !== "RESTORE"}>Tiklash</Button></>}>
      <div className="space-y-3 text-sm">
        <div className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-destructive"><AlertTriangle className="h-5 w-5 shrink-0" /><p>Joriy ma'lumotlar (o'quvchilar, davomat, navbatchilar va h.k.) zaxiradagi holat bilan almashtiriladi. Tiklashdan oldin joriy holatning xavfsizlik nusxasi avtomatik yaratiladi — u yaratilmasa, tiklash bajarilmaydi. Faollik jurnali o'zgarmaydi.</p></div>
        <Field label="Tasdiqlash uchun RESTORE deb yozing"><Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" /></Field>
      </div>
    </Dialog>
  );
}
