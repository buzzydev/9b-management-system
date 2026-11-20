"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, MessageSquarePlus, Send, Users } from "lucide-react";
import { api, errMsg, revalidatePrefix, useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/providers";
import { fmtDateTime, timeAgo } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, Badge, EmptyState, ErrorState, ListSkeleton, ROLE_TONE } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";

const ROLE: Record<string, string> = { ADMIN: "Admin", TEACHER: "O'qituvchi", CLASS_LEADER: "Sinf rahbari", ASSISTANT: "Yordamchi" };
type Thread = { id: string; title: string; isGroup: boolean; avatarUrl: string | null; lastMessage: { body: string; senderId: string | null; senderName: string | null; createdAt: string } | null; unread: number; members: { id: string }[] };
type Msg = { id: string; senderId: string | null; senderName: string | null; body: string; createdAt: string };
type Detail = { thread: { id: string; title: string; isGroup: boolean }; members: { id: string; fullName: string; role: string; lastReadAt: string | null }[]; messages: Msg[]; hasMore: boolean };

export function MessagesView() {
  const router = useRouter();
  const sp = useSearchParams();
  const active = sp.get("thread");
  const [composing, setComposing] = useState(false);
  const { data, error, isLoading, mutate } = useApi<{ items: Thread[] }>("/api/messages/threads", { refreshInterval: 15000, revalidateOnFocus: true });
  const open = (id: string | null) => router.replace(id ? `/messages?thread=${id}` : "/messages");
  const refresh = () => { mutate(); revalidatePrefix("/api/notifications", "/api/messages"); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Xabarlar</h1>
        <Button size="sm" onClick={() => setComposing(true)}><MessageSquarePlus className="h-4 w-4" /> Yangi xabar</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className={cn("overflow-hidden", active && "hidden lg:block")}>
          {error && !data ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : isLoading && !data ? <ListSkeleton rows={5} /> : !data?.items.length ? <EmptyState icon={MessageSquarePlus} title="Suhbatlar yo'q" description="“Yangi xabar” tugmasi orqali boshlang." /> : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {data.items.map((t) => (
                <li key={t.id}>
                  <button onClick={() => open(t.id)} className={cn("flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent", active === t.id && "bg-accent")}>
                    {t.isGroup ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><Users className="h-4 w-4" /></span> : <Avatar name={t.title} src={t.avatarUrl} />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{t.title}</span>{t.lastMessage && <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(t.lastMessage.createdAt)}</span>}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.lastMessage ? `${t.lastMessage.senderName ? t.lastMessage.senderName.split(" ")[0] + ": " : ""}${t.lastMessage.body}` : "Xabarlar yo'q"}</span>
                    </span>
                    {t.unread > 0 && <Badge tone="brand">{t.unread}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className={cn(!active && "hidden lg:block")}>
          {active ? <ThreadPane id={active} onBack={() => open(null)} onChanged={refresh} /> : <Card><EmptyState icon={MessageSquarePlus} title="Suhbatni tanlang" className="py-16" /></Card>}
        </div>
      </div>
      <ComposeDialog open={composing} onClose={() => setComposing(false)} onSent={(id) => { setComposing(false); refresh(); open(id); }} />
    </div>
  );
}

function ThreadPane({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const { me } = useMe();
  const { data, error, mutate } = useApi<Detail>(`/api/messages/threads/${id}`, { refreshInterval: 8000, revalidateOnFocus: true });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [older, setOlder] = useState<Msg[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const myId = me?.user.id;

  useEffect(() => { setOlder([]); setMore(null); setText(""); }, [id]);
  useEffect(() => { if (data) onChanged(); /* o'qilgan deb belgilandi */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.thread.id]);
  const last = data?.messages[data.messages.length - 1]?.id;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [last, id]);

  const all = useMemo(() => [...older, ...(data?.messages ?? [])], [older, data]);
  const hasMore = more ?? data?.hasMore ?? false;
  const loadOlder = async () => {
    const first = all[0];
    if (!first) return;
    try {
      const r = await api<Detail>(`/api/messages/threads/${id}?before=${encodeURIComponent(first.createdAt)}`);
      setOlder((p) => [...r.messages, ...p]);
      setMore(r.hasMore);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try { await api(`/api/messages/threads/${id}`, { body: { body } }); setText(""); await mutate(); onChanged(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (error && !data) return <Card><ErrorState message={errMsg(error)} onRetry={() => mutate()} /></Card>;
  if (!data) return <Card><ListSkeleton rows={5} /></Card>;
  const others = data.members.filter((m) => m.id !== myId);
  const seenBy = (m: Msg) => m.senderId === myId && others.length > 0 && others.every((o) => o.lastReadAt && new Date(o.lastReadAt) >= new Date(m.createdAt));

  return (
    <Card className="flex h-[70vh] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Button size="icon-sm" variant="ghost" className="lg:hidden" aria-label="Orqaga" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1"><p className="truncate font-medium">{data.thread.title}</p>{data.thread.isGroup && <p className="truncate text-xs text-muted-foreground">{data.members.map((m) => m.fullName).join(", ")}</p>}</div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {hasMore && <div className="text-center"><Button size="sm" variant="ghost" onClick={loadOlder}>Oldingi xabarlar</Button></div>}
        {all.map((m) => {
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {!mine && data.thread.isGroup && <p className="text-xs font-semibold opacity-80">{m.senderName ?? "Foydalanuvchi"}</p>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className="mt-0.5 text-right text-[10px] opacity-70">{fmtDateTime(m.createdAt)}{seenBy(m) ? " · ko'rildi" : ""}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Textarea rows={1} className="max-h-32 min-h-10 flex-1 resize-none" placeholder="Xabar yozing…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button type="submit" size="icon" aria-label="Yuborish" loading={busy} disabled={!text.trim()}><Send className="h-4 w-4" /></Button>
      </form>
    </Card>
  );
}

function ComposeDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (threadId: string) => void }) {
  const { data } = useApi<{ items: { id: string; fullName: string; role: string; avatarUrl: string | null }[] }>(open ? "/api/messages/users" : null);
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSel([]); setTitle(""); setBody(""); setQ(""); } }, [open]);
  const list = data?.items.filter((u) => u.fullName.toLowerCase().includes(q.toLowerCase())) ?? [];
  const send = async () => {
    if (!sel.length) return toast.error("Qabul qiluvchini tanlang");
    if (sel.length > 1 && !title.trim()) return toast.error("Guruh nomini kiriting");
    if (!body.trim()) return toast.error("Xabar matnini kiriting");
    setBusy(true);
    try { const r = await api<{ thread: { id: string } }>("/api/messages/threads", { body: { userIds: sel, title: sel.length > 1 ? title : null, body } }); toast.success("Yuborildi"); onSent(r.thread.id); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Yangi xabar" description="Bitta kishi — shaxsiy suhbat, bir nechta — guruh" footer={<><Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button onClick={send} loading={busy}><Send className="h-4 w-4" /> Yuborish</Button></>}>
      <div className="space-y-3">
        <Input placeholder="Foydalanuvchini qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {!list.length ? <li className="p-3 text-sm text-muted-foreground">Foydalanuvchi topilmadi</li> : list.map((u) => (
            <li key={u.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent">
                <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--brand))]" checked={sel.includes(u.id)} onChange={() => setSel((p) => (p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id]))} />
                <Avatar name={u.fullName} src={u.avatarUrl} size={28} /><span className="flex-1 truncate text-sm">{u.fullName}</span><Badge tone={ROLE_TONE[u.role]}>{ROLE[u.role] ?? u.role}</Badge>
              </label>
            </li>
          ))}
        </ul>
        {sel.length > 1 && <Field label="Guruh nomi"><Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></Field>}
        <Field label="Xabar"><Textarea rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
