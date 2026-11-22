"use client";

import { useEffect, useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { errMsg, qs, useApi } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { Badge, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { PageHeader, Pagination } from "@/components/ui/data";
import { Input, Select } from "@/components/ui/form";

type Log = { id: string; action: string; category: string; description: string; userName: string; role: string | null; entityType: string | null; entityId: string | null; ip: string | null; createdAt: string };
type Data = { items: Log[]; total: number; pageSize: number; facets: { categories: string[]; users: { id: string; name: string }[] } };

export function LogsView() {
  const [f, setF] = useState({ q: "", category: "", userId: "", from: "", to: "" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setF((p) => ({ ...p, q })); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);
  const { data, error, isLoading, mutate } = useApi<Data>(`/api/logs${qs({ ...f, page, pageSize: 25 })}`);
  const set = (k: "category" | "userId" | "from" | "to", v: string) => { setF((p) => ({ ...p, [k]: v })); setPage(1); };

  return (
    <div className="space-y-4">
      <PageHeader title="Faollik jurnali" description="Faqat o'qish: yozuvlarni o'zgartirib yoki o'chirib bo'lmaydi" />
      <Card className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Qidirish…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" /></div>
        <Select value={f.category} onChange={(e) => set("category", e.target.value)} aria-label="Kategoriya"><option value="">Barcha kategoriyalar</option>{data?.facets.categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        <Select value={f.userId} onChange={(e) => set("userId", e.target.value)} aria-label="Foydalanuvchi"><option value="">Barcha foydalanuvchilar</option>{data?.facets.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <Input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} aria-label="Dan" />
        <Input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} aria-label="Gacha" />
      </Card>
      <Card>
        {error && !data ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : isLoading && !data ? <ListSkeleton rows={8} /> : !data?.items.length ? <EmptyState icon={ScrollText} title="Yozuvlar topilmadi" /> : (
          <ul className="divide-y divide-border">
            {data.items.map((l) => (
              <li key={l.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2"><Badge tone="brand">{l.category}</Badge><span className="text-xs font-mono text-muted-foreground">{l.action}</span><span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(l.createdAt)}</span></div>
                <p className="mt-1 break-words text-sm">{l.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{l.userName}{l.role ? ` (${l.role})` : ""}{l.ip ? ` · ${l.ip}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
        {data && <div className="px-4"><Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>}
      </Card>
    </div>
  );
}
