"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, DatabaseBackup, Download, RotateCcw, Trash2 } from "lucide-react";
import { api, downloadUrl, errMsg, useApi } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/data";
import { Dialog } from "@/components/ui/dialog";
import { Badge, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm";

type B = { id: string; filename: string; sizeBytes: number; checksum: string | null; recordCount: number; status: string; error: string | null; createdAt: string; restoredAt: string | null; createdBy: { fullName: string } | null };
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function BackupView() {
  const confirm = useConfirm();
  const { data, error, isLoading, mutate } = useApi<{ items: B[] }>("/api/backups");
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<B | null>(null);

  const create = async () => {
    setBusy(true);
    try { await api("/api/backups", { method: "POST" }); toast.success("Zaxira nusxa yaratildi"); mutate(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async (b: B) => {
    if (!(await confirm({ title: "Zaxirani o'chirish", description: `${b.filename} butunlay o'chiriladi.`, confirmText: "O'chirish", destructive: true }))) return;
    try { await api(`/api/backups/${b.id}`, { method: "DELETE" }); toast.success("O'chirildi"); mutate(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Zaxira nusxalar" description="To'liq ma'lumotlar nusxasi doimiy xotirada va bazada saqlanadi" actions={<Button size="sm" onClick={create} loading={busy}><DatabaseBackup className="h-4 w-4" /> Zaxira yaratish</Button>} />
      <Card>
        {error && !data ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : isLoading && !data ? <ListSkeleton rows={4} /> : !data?.items.length ? <EmptyState icon={DatabaseBackup} title="Zaxira nusxalar yo'q" description="Birinchi zaxirani yarating." /> : (
          <ul className="divide-y divide-border">
            {data.items.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm font-medium">{b.filename}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(b.createdAt)} · {b.createdBy?.fullName ?? "Tizim"} · {size(b.sizeBytes)} · {b.recordCount} yozuv</p>
                  {b.checksum && <p className="truncate font-mono text-[10px] text-muted-foreground">SHA-256: {b.checksum}</p>}
                  {b.error && <p className="text-xs text-destructive">{b.error}</p>}
                  {b.restoredAt && <p className="text-xs text-muted-foreground">Tiklangan: {fmtDateTime(b.restoredAt)}</p>}
                </div>
                <Badge tone={b.status === "SUCCESS" ? "success" : b.status === "FAILED" ? "danger" : "warning"}>{b.status === "SUCCESS" ? "Tayyor" : b.status === "FAILED" ? "Xato" : b.status}</Badge>
                <div className="flex">
                  <Button size="icon-sm" variant="ghost" aria-label="Yuklab olish" disabled={b.status !== "SUCCESS"} onClick={() => downloadUrl(`/api/backups/${b.id}`)}><Download className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Tiklash" disabled={b.status !== "SUCCESS"} onClick={() => setRestore(b)}><RotateCcw className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="O'chirish" onClick={() => remove(b)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <RestoreDialog backup={restore} onClose={() => setRestore(null)} onDone={() => { setRestore(null); mutate(); }} />
    </div>
  );
}

function RestoreDialog({ backup, onClose, onDone }: { backup: B | null; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      const r = await api<{ skippedUsers?: string[] }>(`/api/backups/${backup.id}`, { body: { confirm: "RESTORE" } });
      toast.success(r.skippedUsers?.length ? `Tiklandi. O'tkazib yuborilgan foydalanuvchilar: ${r.skippedUsers.length}` : "Ma'lumotlar tiklandi");
      setText("");
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!backup} onClose={onClose} title="Zaxiradan tiklash" description={backup?.filename} footer={<><Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button variant="destructive" onClick={run} loading={busy} disabled={text !== "RESTORE"}>Tiklash</Button></>}>
      <div className="space-y-3 text-sm">
        <div className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-destructive"><AlertTriangle className="h-5 w-5 shrink-0" /><p>Joriy ma'lumotlar (o'quvchilar, davomat, baholar va h.k.) zaxiradagi holat bilan almashtiriladi. Tiklashdan oldin joriy holatning xavfsizlik nusxasi avtomatik yaratiladi. Faollik jurnali o'zgarmaydi.</p></div>
        <Field label="Tasdiqlash uchun RESTORE deb yozing"><Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" /></Field>
      </div>
    </Dialog>
  );
}
