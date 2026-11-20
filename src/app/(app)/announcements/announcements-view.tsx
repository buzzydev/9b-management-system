"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, Megaphone, Paperclip, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { api, errMsg, qs, revalidatePrefix, uploadFile, useApi } from "@/lib/client/api";
import { fmtDateTime, fromLocalInput, timeAgo, toLocalInput } from "@/lib/client/format";
import { useReadOnly } from "@/lib/client/providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, Pagination } from "@/components/ui/data";
import { Dialog } from "@/components/ui/dialog";
import { Badge, EmptyState, ErrorState, ListSkeleton, PRIORITY_TONE, ROLE_TONE } from "@/components/ui/feedback";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm";

const PRIORITY: Record<string, string> = { NORMAL: "Oddiy", IMPORTANT: "Muhim", URGENT: "Shoshilinch" };
const ROLE: Record<string, string> = { ADMIN: "Admin", TEACHER: "O'qituvchi", CLASS_LEADER: "Sinf rahbari", ASSISTANT: "Yordamchi" };
type Att = { name: string; url: string };
type Ann = { id: string; title: string; body: string; priority: string; pinned: boolean; publishAt: string; attachments: Att[]; author: { id: string; fullName: string }; read: boolean; readCount: number; scheduled: boolean };

export function AnnouncementsView() {
  const ro = useReadOnly();
  const confirm = useConfirm();
  const [priority, setPriority] = useState("");
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Ann | "new" | null>(null);
  const [readers, setReaders] = useState<Ann | null>(null);
  const { data, error, isLoading, mutate } = useApi<{ items: Ann[]; total: number; unread: number; pageSize: number }>(`/api/announcements${qs({ priority, unread: unread ? 1 : "", page })}`);

  const refresh = () => { mutate(); revalidatePrefix("/api/dashboard", "/api/notifications"); };
  const markRead = async (a: Ann) => {
    if (a.read) return;
    try { await api(`/api/announcements/${a.id}/read`, { method: "POST" }); refresh(); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (a: Ann) => {
    if (!(await confirm({ title: "E'lonni o'chirish", description: `“${a.title}” o'chiriladi.`, confirmText: "O'chirish", destructive: true }))) return;
    try { await api(`/api/announcements/${a.id}`, { method: "DELETE" }); toast.success("O'chirildi"); refresh(); } catch (e) { toast.error(errMsg(e)); }
  };
  const togglePin = async (a: Ann) => {
    try { await api(`/api/announcements/${a.id}`, { method: "PATCH", body: { pinned: !a.pinned } }); refresh(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="E'lonlar" description={data ? `O'qilmagan: ${data.unread}` : undefined} actions={ro ? undefined : <Button size="sm" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Yangi e'lon</Button>} />
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <Select className="w-auto" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} aria-label="Muhimlik"><option value="">Barcha muhimlik</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        {!ro && <><Switch checked={unread} onCheckedChange={(v) => { setUnread(v); setPage(1); }} label="Faqat o'qilmaganlar" />
        <span className="text-sm text-muted-foreground">Faqat o'qilmaganlar</span></>}
      </Card>

      {error && !data ? <Card><ErrorState message={errMsg(error)} onRetry={() => mutate()} /></Card> : isLoading && !data ? <ListSkeleton rows={4} /> : !data?.items.length ? <Card><EmptyState icon={Megaphone} title="E'lonlar yo'q" description="Yangi e'lon yarating." /></Card> : (
        <div className="space-y-3">
          {data.items.map((a) => (
            <Card key={a.id} className={`p-4 ${!a.read ? "border-primary/60" : ""}`} onClick={() => !ro && markRead(a)}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned && <Pin className="h-4 w-4 text-primary" aria-label="Mahkamlangan" />}
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge tone={PRIORITY_TONE[a.priority]}>{PRIORITY[a.priority]}</Badge>
                    {a.scheduled && <Badge tone="info">Rejalashtirilgan: {fmtDateTime(a.publishAt)}</Badge>}
                    {!a.read && <Badge tone="brand">Yangi</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.author.fullName} · {timeAgo(a.publishAt)}</p>
                </div>
                {!ro && <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon-sm" variant="ghost" aria-label="O'qiganlar" onClick={() => setReaders(a)}><Eye className="h-4 w-4" /><span className="sr-only">{a.readCount}</span></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={a.pinned ? "Mahkamni olish" : "Mahkamlash"} onClick={() => togglePin(a)}><Pin className={`h-4 w-4 ${a.pinned ? "fill-current" : ""}`} /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Tahrirlash" onClick={() => setEdit(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="O'chirish" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>}
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{a.body}</p>
              {a.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {a.attachments.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs hover:bg-accent"><Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{f.name}</span></a>)}
                </div>
              )}
              {!ro && <p className="mt-3 text-xs text-muted-foreground">O'qigan: {a.readCount}</p>}
            </Card>
          ))}
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}

      <AnnDialog target={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />
      <ReadersDialog ann={readers} onClose={() => setReaders(null)} />
    </div>
  );
}

function ReadersDialog({ ann, onClose }: { ann: Ann | null; onClose: () => void }) {
  const { data, error } = useApi<{ items: { userId: string; fullName: string; role: string; readAt: string }[] }>(ann ? `/api/announcements/${ann.id}/read` : null);
  return (
    <Dialog open={!!ann} onClose={onClose} title="O'qiganlar" description={ann?.title} footer={<Button variant="outline" onClick={onClose}>Yopish</Button>}>
      {error ? <ErrorState message={errMsg(error)} /> : !data ? <ListSkeleton rows={3} /> : !data.items.length ? <EmptyState title="Hali hech kim o'qimagan" className="py-4" /> : (
        <ul className="divide-y divide-border">{data.items.map((r) => (
          <li key={r.userId} className="flex items-center gap-2 py-2 text-sm"><span className="flex-1 truncate">{r.fullName}</span><Badge tone={ROLE_TONE[r.role]}>{ROLE[r.role] ?? r.role}</Badge><span className="text-xs text-muted-foreground">{fmtDateTime(r.readAt)}</span></li>
        ))}</ul>
      )}
    </Dialog>
  );
}

function AnnDialog({ target, onClose, onSaved }: { target: Ann | "new" | null; onClose: () => void; onSaved: () => void }) {
  const a = target && target !== "new" ? target : null;
  const [f, setF] = useState({ title: "", body: "", priority: "NORMAL", pinned: false, publishAt: "" });
  const [files, setFiles] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    if (a) { setF({ title: a.title, body: a.body, priority: a.priority, pinned: a.pinned, publishAt: toLocalInput(a.publishAt) }); setFiles(a.attachments); }
    else { setF({ title: "", body: "", priority: "NORMAL", pinned: false, publishAt: "" }); setFiles([]); }
  }, [target, a]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) { const r = await uploadFile(file, "file"); setFiles((p) => [...p, { name: r.name, url: r.url }]); }
    } catch (e) { toast.error(errMsg(e)); } finally { setUploading(false); if (ref.current) ref.current.value = ""; }
  };
  const save = async () => {
    if (!f.title.trim() || !f.body.trim()) return toast.error("Sarlavha va matnni kiriting");
    const body: Record<string, unknown> = { title: f.title, body: f.body, priority: f.priority, pinned: f.pinned, attachments: files };
    if (f.publishAt) body.publishAt = fromLocalInput(f.publishAt);
    setBusy(true);
    try {
      if (a) await api(`/api/announcements/${a.id}`, { method: "PATCH", body });
      else await api("/api/announcements", { body });
      toast.success("Saqlandi");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!target} onClose={onClose} title={a ? "E'lonni tahrirlash" : "Yangi e'lon"} footer={<><Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button onClick={save} loading={busy} disabled={uploading}>{a ? "Saqlash" : "Chop etish"}</Button></>}>
      <div className="space-y-3">
        <Field label="Sarlavha"><Input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Matn"><Textarea rows={6} maxLength={10000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Muhimlik"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Chop etish vaqti" hint="Bo'sh = hozir"><Input type="datetime-local" value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} /></Field>
        </div>
        <div className="flex items-center gap-2 text-sm"><Switch checked={f.pinned} onCheckedChange={(v) => setF({ ...f, pinned: v })} label="Mahkamlash" /> Mahkamlash</div>
        <div className="space-y-2">
          {files.map((x) => (
            <div key={x.url} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="flex-1 truncate">{x.name}</span><button type="button" aria-label="Olib tashlash" onClick={() => setFiles((p) => p.filter((y) => y.url !== x.url))}><X className="h-4 w-4" /></button></div>
          ))}
          <input ref={ref} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" loading={uploading} disabled={files.length >= 10} onClick={() => ref.current?.click()}><Paperclip className="h-4 w-4" /> Fayl biriktirish</Button>
        </div>
      </div>
    </Dialog>
  );
}
