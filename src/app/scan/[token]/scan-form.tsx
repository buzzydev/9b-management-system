"use client";

import { useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { api, ApiError, useApi } from "@/lib/client/api";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Spinner } from "@/components/ui/feedback";

type Check = { valid: boolean; reason?: string; className?: string; expiresAt?: string };
type Result = { kind: "success"; status: "PRESENT" | "LATE"; name: string } | { kind: "duplicate" } | { kind: "error"; message: string };

const REASONS: Record<string, string> = {
  expired: "QR kodning muddati tugagan. O'qituvchidan yangi kod so'rang.",
  closed: "Bu davomat sessiyasi yopilgan.",
  wrong_day: "Bu QR kod boshqa kunga tegishli.",
  invalid: "QR kod noto'g'ri.",
};

export function ScanForm({ token }: { token: string }) {
  const { data, isLoading } = useApi<Check>(`/api/scan?token=${encodeURIComponent(token)}`, { revalidateOnMount: true });
  const [code, setCode] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ status: "PRESENT" | "LATE"; studentName: string }>("/api/scan", { body: { token, studentCode: code.trim(), dateOfBirth: dob } });
      setResult({ kind: "success", status: r.status, name: r.studentName });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setResult({ kind: "duplicate" });
      else setResult({ kind: "error", message: err instanceof Error ? err.message : "Xatolik yuz berdi" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-accent/60 to-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
          ) : !data?.valid ? (
            <div className="space-y-3 py-4 text-center">
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="text-lg font-semibold">QR kod ishlamaydi</h1>
              <p className="text-sm text-muted-foreground">{REASONS[data?.reason ?? "invalid"] ?? REASONS.invalid}</p>
            </div>
          ) : result?.kind === "success" ? (
            <div className="space-y-3 py-4 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
              <h1 className="text-lg font-semibold">Davomat belgilandi</h1>
              <p className="text-sm">{result.name}</p>
              <p className="text-sm text-muted-foreground">{result.status === "LATE" ? "Holat: kechikdi" : "Holat: keldi"}</p>
            </div>
          ) : result?.kind === "duplicate" ? (
            <div className="space-y-3 py-4 text-center">
              <Clock className="mx-auto h-12 w-12 text-info" />
              <h1 className="text-lg font-semibold">Davomat allaqachon belgilangan</h1>
              <p className="text-sm text-muted-foreground">Bugun uchun davomatingiz yozib bo'lingan. Qayta belgilash shart emas.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold">Davomatni belgilash</h1>
                <p className="mt-1 text-sm text-muted-foreground">Sinf: {data.className}. ID raqamingiz va tug'ilgan sanangizni kiriting.</p>
              </div>
              <Field label="O'quvchi ID">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="9B-001" autoCapitalize="characters" autoComplete="off" required />
              </Field>
              <Field label="Tug'ilgan sana">
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
              </Field>
              {result?.kind === "error" && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{result.message}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!code.trim() || !dob}>Keldim</Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
