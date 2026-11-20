"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, BellOff, CheckCheck, Trash2 } from "lucide-react";
import { api, errMsg, qs, revalidatePrefix, useApi } from "@/lib/client/api";
import { timeAgo } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, Pagination } from "@/components/ui/data";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { Select, Switch } from "@/components/ui/form";

const TYPES: Record<string, string> = { ATTENDANCE_SAVED: "Davomat", STUDENT_ABSENT: "Qatnashmagan o'quvchi", HOMEWORK_ASSIGNED: "Yangi uy vazifa", HOMEWORK_DEADLINE: "Vazifa muddati", NEW_ANNOUNCEMENT: "E'lon", GRADE_UPDATED: "Baho", TIMETABLE_CHANGED: "Dars jadvali", UPCOMING_EXAM: "Imtihon", MESSAGE: "Xabar", SYSTEM: "Tizim" };
type N = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

export function NotificationsView() {
  const [type, setType] = useState("");
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useApi<{ items: N[]; total: number; unread: number; pageSize: number }>(`/api/notifications${qs({ type, unread: unread ? 1 : "", page })}`, { refreshInterval: 30000 });
  const refresh = () => { mutate(); revalidatePrefix("/api/notifications"); };

  const readAll = async () => { try { await api("/api/notifications", { body: { action: "read-all" } }); refresh(); } catch (e) { toast.error(errMsg(e)); } };
  const markRead = async (n: N) => { if (n.readAt) return; try { await api(`/api/notifications/${n.id}`, { method: "PATCH" }); refresh(); } catch { /* sezilmaydi */ } };
  const remove = async (n: N) => { try { await api(`/api/notifications/${n.id}`, { method: "DELETE" }); refresh(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div className="space-y-4">
      <PageHeader title="Bildirishnomalar" description={data ? `O'qilmagan: ${data.unread}` : undefined} actions={<Button variant="outline" size="sm" onClick={readAll} disabled={!data?.unread}><CheckCheck className="h-4 w-4" /> Hammasini o'qilgan qilish</Button>} />
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <Select className="w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Tur"><option value="">Barcha turlar</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <div className="flex items-center gap-2 text-sm"><Switch checked={unread} onCheckedChange={(v) => { setUnread(v); setPage(1); }} label="Faqat o'qilmaganlar" /> Faqat o'qilmaganlar</div>
      </Card>
      <Card>
        {error && !data ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : isLoading && !data ? <ListSkeleton rows={6} /> : !data?.items.length ? <EmptyState icon={BellOff} title="Bildirishnomalar yo'q" /> : (
          <ul className="divide-y divide-border">
            {data.items.map((n) => {
              const inner = (
                <>
                  <span className={cn("mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", n.readAt ? "bg-muted text-muted-foreground" : "bg-brand/15 text-brand")}><Bell className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                    {n.body && <span className="block break-words text-xs text-muted-foreground">{n.body}</span>}
                    <span className="block text-[11px] text-muted-foreground">{TYPES[n.type] ?? n.type} · {timeAgo(n.createdAt)}</span>
                  </span>
                </>
              );
              return (
                <li key={n.id} className="flex items-start gap-2 px-4 py-3">
                  {n.link ? <Link href={n.link} onClick={() => markRead(n)} className="flex min-w-0 flex-1 items-start gap-3">{inner}</Link> : <button className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => markRead(n)}>{inner}</button>}
                  <Button size="icon-sm" variant="ghost" aria-label="O'chirish" onClick={() => remove(n)}><Trash2 className="h-4 w-4" /></Button>
                </li>
              );
            })}
          </ul>
        )}
        {data && <div className="px-4"><Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>}
      </Card>
    </div>
  );
}
