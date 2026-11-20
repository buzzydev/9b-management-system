"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, DoorOpen } from "lucide-react";
import { api, errMsg, revalidatePrefix } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";

const PRESETS = [1, 2, 3, 4, 5];
const hoursText = (h: number) => `${String(h).replace(".", ",")} soat`;

/**
 * «Qochib ketdi» — 3 bosqich:
 *  1) necha soatga ketgani  →  2) majburiy izoh (sabab va qaysi vaqtda)  →  3) administrator tasdiqlaydi.
 * Holat FAQAT 3-bosqichdagi «Tasdiqlash» bosilgandan keyin o'zgaradi (server ham `confirmed: true` talab qiladi).
 */
export function EscapeDialog({ student, date, onClose }: { student: { id: string; fullName: string } | null; date: string; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preset, setPreset] = useState<number | "custom" | null>(null);
  const [custom, setCustom] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (student) { setStep(1); setPreset(null); setCustom(""); setReason(""); }
  }, [student]);

  const customNum = Number(custom.replace(",", "."));
  const hours = preset === "custom" ? customNum : preset ?? NaN;
  const hoursOk = Number.isFinite(hours) && hours >= 0.5 && hours <= 24;
  const reasonOk = reason.trim().length >= 10;

  const confirm = async () => {
    if (!student || !hoursOk || !reasonOk) return;
    setBusy(true);
    try {
      await api("/api/escapes", { body: { studentId: student.id, date, hours, reason: reason.trim(), confirmed: true } });
      toast.success(`${student.fullName}: «Qochib ketdi» qayd etildi`);
      revalidatePrefix("/api/attendance", "/api/dashboard", "/api/escapes", "/api/students");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === 1 ? (
      <><Button variant="outline" onClick={onClose}>Bekor qilish</Button><Button disabled={!hoursOk} onClick={() => setStep(2)}>Davom etish</Button></>
    ) : step === 2 ? (
      <><Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Orqaga</Button><Button disabled={!reasonOk} onClick={() => setStep(3)}>Davom etish</Button></>
    ) : (
      <><Button variant="ghost" onClick={() => setStep(2)} disabled={busy}><ArrowLeft className="h-4 w-4" /> Orqaga</Button><Button variant="destructive" onClick={confirm} loading={busy}><DoorOpen className="h-4 w-4" /> Tasdiqlash</Button></>
    );

  return (
    <Dialog open={!!student} onClose={onClose} title="Qochib ketdi" description={student ? `${student.fullName} · ${fmtDate(date)} · ${step}/3-bosqich` : undefined} footer={footer}>
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">O'quvchi necha soatga ketdi?</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PRESETS.map((h) => (
              <button key={h} type="button" onClick={() => setPreset(h)} aria-pressed={preset === h} className={cn("h-11 rounded-xl border text-sm font-semibold transition-colors", preset === h ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}>{h} soat</button>
            ))}
            <button type="button" onClick={() => setPreset("custom")} aria-pressed={preset === "custom"} className={cn("h-11 rounded-xl border text-sm font-semibold transition-colors", preset === "custom" ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}>Boshqa</button>
          </div>
          {preset === "custom" && (
            <Field label="Soat (qo'lda kiriting)" hint="0,5 dan 24 gacha; masalan 1,5" error={custom !== "" && !hoursOk ? "0,5 – 24 oralig'ida bo'lishi kerak" : undefined}>
              <Input autoFocus inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Masalan: 6" />
            </Field>
          )}
        </div>
      )}
      {step === 2 && (
        <Field label="Izoh (majburiy)" hint="Nima sababdan va qaysi vaqtda ketgani. Kamida 10 belgi." error={reason !== "" && !reasonOk ? "Izoh juda qisqa" : undefined}>
          <Textarea autoFocus rows={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: 3-darsdan keyin, soat 10:40 da ruxsatsiz maktabdan chiqib ketdi." />
        </Field>
      )}
      {step === 3 && student && (
        <div className="space-y-3 text-sm">
          <p>Quyidagi qayd tasdiqlansa, o'quvchining holati <b>«Qochib ketdi»</b> ga o'zgaradi va tarixga yoziladi:</p>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 rounded-xl bg-muted p-3">
            <dt className="text-muted-foreground">O'quvchi</dt><dd className="font-medium">{student.fullName}</dd>
            <dt className="text-muted-foreground">Sana</dt><dd>{fmtDate(date)}</dd>
            <dt className="text-muted-foreground">Ketgan muddat</dt><dd>{hoursText(hours)}</dd>
            <dt className="text-muted-foreground">Izoh</dt><dd className="whitespace-pre-wrap break-words">{reason.trim()}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">Qaydni keyin o'zgartirib yoki o'chirib bo'lmaydi.</p>
        </div>
      )}
    </Dialog>
  );
}
