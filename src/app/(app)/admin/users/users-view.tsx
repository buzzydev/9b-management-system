"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, History, Pencil, Plus, Search, Trash2, UserCog } from "lucide-react";
import { api, errMsg, qs, useApi } from "@/lib/client/api";
import { useMe } from "@/lib/client/providers";
import { fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, Pagination } from "@/components/ui/data";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, Badge, EmptyState, ErrorState, ListSkeleton, ROLE_TONE } from "@/components/ui/feedback";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm";

const ROLES: Record<string, string> = { ADMIN: "Administrator", TEACHER: "O'qituvchi", CLASS_LEADER: "Sinf rahbari", ASSISTANT: "Yordamchi" };
type U = { id: string; username: string; fullName: string; email: string | null; phone: string | null; avatarUrl: string | null; role: string; isActive: boolean; mustChangePassword: boolean; lastLoginAt: string | null; lockedUntil: string | null };

export function UsersView() {
  const me = useMe().me?.user;
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<U | "new" | null>(null);
  const [reset, setReset] = useState<U | null>(null);
  const [logins, setLogins] = useState<U | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);
  const { data, error, isLoading, mutate } = useApi<{ items: U[]; total: number; pageSize: number; totals: { active: number } }>(`/api/users${qs({ q: dq, role, isActive: active, page, pageSize: 20 })}`);

  const toggle = async (u: U) => {
    if (u.isActive && !(await confirm({ title: "Foydalanuvchini nofaol qilish", description: `${u.fullName} tizimga kira olmaydi, faol sessiyalari to'xtatiladi.`, confirmText: "Nofaol qilish", destructive: true }))) return;
    try { await api(`/api/users/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } }); toast.success(u.isActive ? "Nofaol qilindi" : "Faollashtirildi"); mutate(); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (u: U) => {
    if (!(await confirm({ title: "Foydalanuvchini o'chirish", description: `${u.fullName} (${u.username}) butunlay o'chiriladi. Odatda nofaol qilish yetarli.`, confirmText: "O'chirish", destructive: true }))) return;
    try { await api(`/api/users/${u.id}`, { method: "DELETE" }); toast.success("O'chirildi"); mutate(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Foydalanuvchilar" description={data ? `Jami: ${data.total} · Faol: ${data.totals.active}` : undefined} actions={<Button size="sm" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Yangi foydalanuvchi</Button>} />
      <Card className="grid gap-2 p-3 sm:grid-cols-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Ism, login yoki email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Rol"><option value="">Barcha rollar</option>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} aria-label="Holat"><option value="">Barcha holatlar</option><option value="true">Faol</option><option value="false">Nofaol</option></Select>
      </Card>
      <Card>
        {error && !data ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : isLoading && !data ? <ListSkeleton rows={6} /> : !data?.items.length ? <EmptyState icon={UserCog} title="Foydalanuvchilar topilmadi" /> : (
          <ul className="divide-y divide-border">
            {data.items.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={u.fullName} src={u.avatarUrl} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium">{u.fullName}{u.id === me?.id && <span className="text-muted-foreground"> (siz)</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">@{u.username}{u.email ? ` · ${u.email}` : ""} · Oxirgi kirish: {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "hali yo'q"}</p>
                </div>
                <Badge tone={ROLE_TONE[u.role]}>{ROLES[u.role]}</Badge>
                {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="warning">Bloklangan</Badge>}
                {u.mustChangePassword && <Badge tone="info">Parol almashtirilishi kerak</Badge>}
                <div className="flex items-center gap-2"><Switch checked={u.isActive} disabled={u.id === me?.id} onCheckedChange={() => toggle(u)} label={u.isActive ? "Faol" : "Nofaol"} /><span className="w-12 text-xs text-muted-foreground">{u.isActive ? "Faol" : "Nofaol"}</span></div>
                <div className="flex">
                  <Button size="icon-sm" variant="ghost" aria-label="Kirish tarixi" onClick={() => setLogins(u)}><History className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Parolni tiklash" disabled={u.id === me?.id} onClick={() => setReset(u)}><KeyRound className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Tahrirlash" onClick={() => setEdit(u)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="O'chirish" disabled={u.id === me?.id} onClick={() => remove(u)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && <div className="px-4"><Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>}
      </Card>
      <UserDialog target={edit} self={me?.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); mutate(); }} />
      <ResetDialog user={reset} onClose={() => setReset(null)} />
      <LoginsDialog user={logins} onClose={() => setLogins(null)} />
    </div>
  );
}

function UserDialog({ target, self, onClose, onSaved }: { target: U | "new" | null; self?: string; onClose: () => void; onSaved: () => void }) {
  const u = target && target !== "new" ? target : null;
  const [f, setF] = useState({ username: "", fullName: "", role: "TEACHER", email: "", phone: "", password: "", mustChangePassword: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) return;
    setF(u ? { username: u.username, fullName: u.fullName, role: u.role, email: u.email ?? "", phone: u.phone ?? "", password: "", mustChangePassword: true } : { username: "", fullName: "", role: "TEACHER", email: "", phone: "", password: "", mustChangePassword: true });
  }, [target, u]);
  const save = async () => {
    if (!f.fullName.trim()) return toast.error("To'liq ismni kiriting");
    setBusy(true);
    try {
      if (u) await api(`/api/users/${u.id}`, { method: "PATCH", body: { fullName: f.fullName, role: f.role, email: f.email, phone: f.phone } });
      else await api("/api/users", { body: f });
      toast.success("Saqlandi");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!target} onClose={onClose} title={u ? "Foydalanuvchini tahrirlash" : "Yangi foydalanuvchi"} footer={<><Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button onClick={save} loading={busy}>Saqlash</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Login" hint={u ? "O'zgartirib bo'lmaydi" : "Kichik harf, raqam, _ . -"}><Input value={f.username} disabled={!!u} autoComplete="off" onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="Rol"><Select value={f.role} disabled={u?.id === self} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Field label="To'liq ism"><Input value={f.fullName} maxLength={120} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        {!u && <>
          <Field label="Boshlang'ich parol" hint="Kamida 8 belgi, harf va raqam"><Input type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <div className="flex items-center gap-2 text-sm"><Switch checked={f.mustChangePassword} onCheckedChange={(v) => setF({ ...f, mustChangePassword: v })} label="Birinchi kirishda parolni almashtirish" /> Birinchi kirishda parolni almashtirish</div>
        </>}
      </div>
    </Dialog>
  );
}

function ResetDialog({ user, onClose }: { user: U | null; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPw(""); setResult(null); }, [user]);
  const run = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const r = await api<{ password?: string }>(`/api/users/${user.id}/reset-password`, { body: pw ? { password: pw } : {} });
      if (r.password) setResult(r.password); else { toast.success("Parol yangilandi"); onClose(); }
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!user} onClose={onClose} title="Parolni tiklash" description={user ? `${user.fullName} (@${user.username})` : undefined} footer={result ? <Button onClick={onClose}>Yopish</Button> : <><Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button onClick={run} loading={busy}>Tiklash</Button></>}>
      {result ? (
        <div className="space-y-3 text-sm">
          <p>Vaqtinchalik parol faqat <b>bir marta</b> ko'rsatiladi. Foydalanuvchiga xavfsiz yo'l bilan yuboring — u birinchi kirishda parolni almashtiradi.</p>
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3"><code className="flex-1 select-all break-all text-base font-semibold">{result}</code><Button size="icon-sm" variant="outline" aria-label="Nusxalash" onClick={() => { navigator.clipboard?.writeText(result).then(() => toast.success("Nusxalandi")).catch(() => toast.error("Nusxalab bo'lmadi")); }}><Copy className="h-4 w-4" /></Button></div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Foydalanuvchining barcha faol sessiyalari bekor qilinadi va u keyingi kirishda parolni almashtirishi kerak bo'ladi.</p>
          <Field label="Yangi parol" hint="Bo'sh qoldirsangiz, tasodifiy parol yaratiladi"><Input autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        </div>
      )}
    </Dialog>
  );
}

function LoginsDialog({ user, onClose }: { user: U | null; onClose: () => void }) {
  const { data, error } = useApi<{ items: { id: string; action: string; description: string; ip: string | null; createdAt: string }[] }>(user ? `/api/users/${user.id}/logins` : null);
  const TONE: Record<string, "success" | "default" | "danger"> = { LOGIN: "success", LOGOUT: "default", LOGIN_FAILED: "danger" };
  return (
    <Dialog open={!!user} onClose={onClose} title="Kirish tarixi" description={user?.fullName} footer={<Button variant="outline" onClick={onClose}>Yopish</Button>}>
      {error ? <ErrorState message={errMsg(error)} /> : !data ? <ListSkeleton rows={4} /> : !data.items.length ? <EmptyState title="Yozuvlar yo'q" className="py-4" /> : (
        <ul className="divide-y divide-border">{data.items.map((l) => <li key={l.id} className="flex items-center gap-2 py-2 text-sm"><Badge tone={TONE[l.action]}>{l.action}</Badge><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{l.ip ?? "—"}</span><span className="text-xs">{fmtDateTime(l.createdAt)}</span></li>)}</ul>
      )}
    </Dialog>
  );
}
