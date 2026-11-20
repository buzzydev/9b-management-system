"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Monitor, Moon, Sun } from "lucide-react";
import { api, errMsg } from "@/lib/client/api";
import { useMe } from "@/lib/client/providers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/data";
import { Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { ProfileForm } from "./profile-form";

const TABS = ["profile", "appearance", "notifications", "security"] as const;
type Tab = (typeof TABS)[number];

export function SettingsView() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "profile";
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Sozlamalar" />
      <Tabs value={tab} onChange={(v) => router.replace(`/settings?tab=${v}`)} items={[{ value: "profile", label: "Profil" }, { value: "appearance", label: "Ko'rinish" }, { value: "notifications", label: "Bildirishnomalar" }, { value: "security", label: "Xavfsizlik" }]} />
      {tab === "profile" && <ProfileForm />}
      {tab === "appearance" && <Appearance />}
      {tab === "notifications" && <Notifications />}
      {tab === "security" && <Security />}
    </div>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const { me, refresh } = useMe();
  if (!me) return <Skeleton className="h-48" />;
  const saveTheme = (v: "light" | "dark" | "system") => { setTheme(v); api("/api/settings/user", { method: "PATCH", body: { theme: v } }).then(refresh).catch((e) => toast.error(errMsg(e))); };
  const saveLang = async (v: string) => { try { await api("/api/settings/user", { method: "PATCH", body: { language: v } }); refresh(); toast.success("Til saqlandi"); } catch (e) { toast.error(errMsg(e)); } };
  const opts = [{ v: "light" as const, label: "Yorug'", icon: Sun }, { v: "dark" as const, label: "Qorong'u", icon: Moon }, { v: "system" as const, label: "Tizim", icon: Monitor }];
  return (
    <Card>
      <CardHeader><CardTitle>Ko'rinish</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">Mavzu</p>
          <div className="grid grid-cols-3 gap-2">
            {opts.map((o) => (
              <button key={o.v} onClick={() => saveTheme(o.v)} aria-pressed={theme === o.v} className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition-colors hover:bg-accent", theme === o.v ? "border-primary bg-accent" : "border-border")}><o.icon className="h-5 w-5" />{o.label}</button>
            ))}
          </div>
        </div>
        <Field label="Interfeys tili" hint="Hozircha to'liq tarjima o'zbekcha; boshqa tillar qisman.">
          <Select value={me.settings.language} onChange={(e) => saveLang(e.target.value)}><option value="uz">O'zbekcha</option><option value="en">English</option><option value="ru">Русский</option></Select>
        </Field>
      </CardContent>
    </Card>
  );
}

const NOTIFY: [string, string][] = [["notifyAttendance", "Davomat"], ["notifyAnnouncements", "E'lonlar"], ["notifyTimetable", "Dars jadvali o'zgarishi"], ["notifyEvents", "Tadbirlar va imtihonlar"], ["notifyMessages", "Xabarlar"]];

function Notifications() {
  const { me, refresh } = useMe();
  if (!me) return <Skeleton className="h-48" />;
  const s = me.settings as unknown as Record<string, boolean>;
  const toggle = async (k: string, v: boolean) => { try { await api("/api/settings/user", { method: "PATCH", body: { [k]: v } }); refresh(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card>
      <CardHeader><CardTitle>Bildirishnomalar</CardTitle></CardHeader>
      <CardContent className="divide-y divide-border">
        {NOTIFY.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between py-3"><span className="text-sm">{label}</span><Switch checked={!!s[k]} onCheckedChange={(v) => toggle(k, v)} label={label} /></div>
        ))}
      </CardContent>
    </Card>
  );
}

function Security() {
  const { refresh } = useMe();
  const [f, setF] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.newPassword !== f.confirm) return toast.error("Yangi parollar mos kelmadi");
    setBusy(true);
    try { await api("/api/auth/password", { body: { currentPassword: f.currentPassword, newPassword: f.newPassword } }); toast.success("Parol o'zgartirildi. Boshqa qurilmalardagi sessiyalar to'xtatildi."); setF({ currentPassword: "", newPassword: "", confirm: "" }); refresh(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Parolni o'zgartirish</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label="Joriy parol"><Input type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
          <Field label="Yangi parol" hint="Kamida 8 belgi, harf va raqam"><Input type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
          <Field label="Yangi parolni takrorlang"><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
          <Button type="submit" loading={busy} disabled={!f.currentPassword || !f.newPassword}>Parolni almashtirish</Button>
        </form>
      </CardContent>
    </Card>
  );
}
