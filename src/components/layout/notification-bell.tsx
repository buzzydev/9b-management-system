"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/menu";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/providers";
import { timeAgo } from "@/lib/client/format";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

export function NotificationBell() {
  const { me, refresh } = useMe();
  const router = useRouter();
  const unread = me?.counts.notifications ?? 0;

  return (
    <Dropdown
      panelClassName="w-[min(92vw,22rem)] p-0 max-sm:fixed max-sm:inset-x-3 max-sm:top-[3.75rem] max-sm:w-auto"
      trigger={({ toggle }) => (
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Bildirishnomalar${unread ? `: ${unread} ta o'qilmagan` : ""}`} className="relative">
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      )}
    >
      {({ close }) => <Panel close={close} router={router} refresh={refresh} />}
    </Dropdown>
  );
}

function Panel({ close, router, refresh }: { close: () => void; router: ReturnType<typeof useRouter>; refresh: () => void }) {
  const { data, isLoading, error } = useApi<{ items: Item[]; unread: number }>("/api/notifications?pageSize=8", { revalidateOnMount: true });

  const open = async (n: Item) => {
    if (!n.readAt) {
      await api(`/api/notifications/${n.id}`, { method: "PATCH", body: {} }).catch(() => {});
      mutate("/api/notifications?pageSize=8");
      refresh();
    }
    close();
    if (n.link) router.push(n.link);
  };

  const readAll = async () => {
    await api("/api/notifications", { body: { action: "read-all" } }).catch(() => {});
    mutate("/api/notifications?pageSize=8");
    refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Bildirishnomalar</p>
        <Button variant="ghost" size="sm" onClick={readAll} disabled={!data?.unread}>
          <CheckCheck className="h-3.5 w-3.5" /> Hammasini o'qilgan
        </Button>
      </div>
      <div className="max-h-[22rem] overflow-y-auto">
        {isLoading && !data ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">Yuklab bo'lmadi</p>
        ) : !data?.items.length ? (
          <EmptyState icon={Bell} title="Bildirishnoma yo'q" className="py-8" />
        ) : (
          data.items.map((n) => (
            <button key={n.id} onClick={() => open(n)} className={cn("flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent/60", !n.readAt && "bg-accent/40")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{n.title}</span>
                {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
              </span>
            </button>
          ))
        )}
      </div>
      <Link href="/notifications" onClick={close} className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-brand hover:bg-accent/60">
        Barchasini ko'rish
      </Link>
    </div>
  );
}
