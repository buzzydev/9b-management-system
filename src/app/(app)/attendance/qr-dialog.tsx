"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { QrCode, Users } from "lucide-react";
import { api, errMsg, useApi } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";

type Session = { sessionId: string; token: string; url: string; expiresAt: string; lateAfter: string };
type Live = { scans: number; expiresAt: string; closedAt: string | null; scanned: string[] };

function fmtLeft(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function QrDialog({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const create = useCallback(async () => {
    setBusy(true);
    try {
      const s = await api<Session>("/api/attendance/qr", { method: "POST", body: {} });
      setSession(s);
      setImg(await QRCode.toDataURL(s.url, { width: 360, margin: 1, errorCorrectionLevel: "M" }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open && !session) create();
    if (!open) {
      setSession(null);
      setImg(null);
    }
  }, [open, session, create]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const { data: live } = useApi<Live>(open && session ? `/api/attendance/qr?sessionId=${session.sessionId}` : null, { refreshInterval: 5000 });

  useEffect(() => {
    if (live?.scans) onScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.scans]);

  const left = session ? new Date(session.expiresAt).getTime() - now : 0;
  const expired = !!session && left <= 0;

  const close = async () => {
    if (session) await api(`/api/attendance/qr?sessionId=${session.sessionId}`, { method: "DELETE" }).catch(() => {});
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="QR orqali davomat"
      description="O'quvchilar QR kodni telefon kamerasi bilan skanerlab, ID va tug'ilgan sanasini kiritadi."
      footer={
        <>
          {(expired || !session) && <Button variant="outline" onClick={() => { setSession(null); }} loading={busy}>Yangi QR</Button>}
          <Button onClick={close}>Sessiyani yopish</Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {busy || !img ? (
          <div className="flex h-64 w-64 items-center justify-center"><Spinner className="h-8 w-8" /></div>
        ) : (
          <div className="relative rounded-2xl border border-border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="Davomat QR kodi" width={256} height={256} className={expired ? "opacity-20" : ""} />
            {expired && <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-destructive">Muddati tugadi</span>}
          </div>
        )}
        {session && (
          <div className="grid w-full grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-muted p-3">
              <p className="text-xs text-muted-foreground">Qolgan vaqt</p>
              <p className={`text-2xl font-semibold tabular-nums ${expired ? "text-destructive" : ""}`}>{fmtLeft(left)}</p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-xs text-muted-foreground">Belgilanganlar</p>
              <p className="text-2xl font-semibold tabular-nums">{live?.scans ?? 0}</p>
            </div>
          </div>
        )}
        {live && live.scanned.length > 0 && (
          <div className="w-full">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Users className="h-3.5 w-3.5" /> So'nggi skanerlaganlar</p>
            <ul className="max-h-32 space-y-1 overflow-y-auto text-sm">
              {live.scanned.map((n, i) => <li key={i} className="rounded-lg bg-accent/50 px-3 py-1">{n}</li>)}
            </ul>
          </div>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><QrCode className="h-3.5 w-3.5" /> Qo'lda belgilash har doim ishlaydi. QR faqat bugun uchun amal qiladi.</p>
      </div>
    </Dialog>
  );
}
