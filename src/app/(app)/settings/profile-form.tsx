"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { api, errMsg, uploadFile } from "@/lib/client/api";
import { useMe } from "@/lib/client/providers";
import { fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Badge, ROLE_TONE } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";

export const ROLE_NAME: Record<string, string> = { ADMIN: "Administrator", TEACHER: "O'qituvchi", CLASS_LEADER: "Sinf rahbari", ASSISTANT: "Yordamchi" };

export function ProfileForm() {
  const { me, refresh } = useMe();
  const [f, setF] = useState({ fullName: "", email: "", phone: "" });
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const u = me?.user;
  useEffect(() => { if (u) { setF({ fullName: u.fullName, email: u.email ?? "", phone: u.phone ?? "" }); setAvatar(u.avatarUrl); } }, [u]);
  if (!u) return null;

  const pick = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setUploading(true);
    try { const r = await uploadFile(file, "image"); setAvatar(r.url); } catch (e) { toast.error(errMsg(e)); } finally { setUploading(false); if (ref.current) ref.current.value = ""; }
  };
  const save = async () => {
    if (!f.fullName.trim()) return toast.error("To'liq ismni kiriting");
    setBusy(true);
    try { await api("/api/settings/profile", { method: "PATCH", body: { fullName: f.fullName, email: f.email, phone: f.phone, avatarUrl: avatar } }); toast.success("Profil saqlandi"); refresh(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Profil ma'lumotlari</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={f.fullName || u.username} src={avatar} size={72} />
          <div className="space-y-1">
            <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => pick(e.target.files)} />
            <Button type="button" size="sm" variant="outline" loading={uploading} onClick={() => ref.current?.click()}><Camera className="h-4 w-4" /> Rasm yuklash</Button>
            {avatar && <Button type="button" size="sm" variant="ghost" onClick={() => setAvatar(null)}>Olib tashlash</Button>}
            <p className="text-xs text-muted-foreground">PNG, JPG, WEBP — 5 MB gacha</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Login:</span><b>@{u.username}</b><Badge tone={ROLE_TONE[u.role]}>{ROLE_NAME[u.role]}</Badge><span className="text-xs text-muted-foreground">Oxirgi kirish: {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "—"}</span></div>
        <Field label="To'liq ism"><Input value={f.fullName} maxLength={100} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">Rolni faqat administrator o'zgartira oladi.</p>
        <Button onClick={save} loading={busy}>Saqlash</Button>
      </CardContent>
    </Card>
  );
}
