"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg, revalidatePrefix, useApi } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/data";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";

type S = { schoolName: string; academicYear: string; defaultLanguage: string; attendanceAlertPercent: number; qrTtlMinutes: number; qrLateAfterMinutes: number };

export function SystemView() {
  const { data, error, mutate } = useApi<{ settings: S }>("/api/settings/system");
  const [f, setF] = useState<Record<keyof S, string> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(Object.fromEntries(Object.entries(data.settings).map(([k, v]) => [k, String(v)])) as Record<keyof S, string>); }, [data]);
  const set = (k: keyof S, v: string) => setF((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!f) return;
    const n = (k: keyof S) => Number(f[k]);
    const nums: (keyof S)[] = ["attendanceAlertPercent", "qrTtlMinutes", "qrLateAfterMinutes"];
    if (nums.some((k) => f[k].trim() === "" || !Number.isFinite(n(k)))) return toast.error("Raqamli maydonlarni to'g'ri to'ldiring");
    setBusy(true);
    try {
      await api("/api/settings/system", { method: "PATCH", body: { schoolName: f.schoolName, academicYear: f.academicYear, defaultLanguage: f.defaultLanguage, attendanceAlertPercent: n("attendanceAlertPercent"), qrTtlMinutes: n("qrTtlMinutes"), qrLateAfterMinutes: n("qrLateAfterMinutes") } });
      toast.success("Sozlamalar saqlandi");
      await mutate();
      revalidatePrefix("/api/dashboard", "/api/me");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (error && !data) return <ErrorState message={errMsg(error)} onRetry={() => mutate()} />;
  if (!f) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Tizim sozlamalari" description="Faqat administrator. Barcha o'zgarishlar faollik jurnaliga yoziladi." actions={<Button onClick={save} loading={busy}>Saqlash</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Umumiy</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Maktab nomi"><Input value={f.schoolName} maxLength={120} onChange={(e) => set("schoolName", e.target.value)} /></Field>
            <Field label="O'quv yili"><Input value={f.academicYear} maxLength={20} onChange={(e) => set("academicYear", e.target.value)} /></Field>
            <Field label="Standart til"><Select value={f.defaultLanguage} onChange={(e) => set("defaultLanguage", e.target.value)}><option value="uz">O'zbekcha</option><option value="en">English</option><option value="ru">Русский</option></Select></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Davomat va QR</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Davomat ogohlantirish chegarasi (%)" className="col-span-2"><Input type="number" min={1} max={100} value={f.attendanceAlertPercent} onChange={(e) => set("attendanceAlertPercent", e.target.value)} /></Field>
            <Field label="QR amal qilish muddati (daq.)"><Input type="number" min={1} max={120} value={f.qrTtlMinutes} onChange={(e) => set("qrTtlMinutes", e.target.value)} /></Field>
            <Field label="Kechikish chegarasi (daq.)"><Input type="number" min={0} max={120} value={f.qrLateAfterMinutes} onChange={(e) => set("qrLateAfterMinutes", e.target.value)} /></Field>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
