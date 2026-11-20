import { format, formatDistanceToNowStrict, parseISO, isValid } from "date-fns";
import { uz } from "date-fns/locale";

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? parseISO(v) : v;
  return isValid(d) ? d : null;
}

/** "YYYY-MM-DD" yoki ISO → "16-noy, 2026". Sana-only qiymatlar UTC bo'yicha o'qiladi (siljimaydi). */
export function fmtDate(v: string | Date | null | undefined, pattern = "d-MMM, yyyy") {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return format(new Date(y, m - 1, d), pattern, { locale: uz });
  }
  const d = toDate(v);
  return d ? format(d, pattern, { locale: uz }) : "—";
}

export function fmtDateTime(v: string | Date | null | undefined) {
  const d = toDate(v);
  return d ? format(d, "d-MMM, HH:mm", { locale: uz }) : "—";
}

export function fmtTime(v: string | Date | null | undefined) {
  const d = toDate(v);
  return d ? format(d, "HH:mm") : "—";
}

export function timeAgo(v: string | Date | null | undefined) {
  const d = toDate(v);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return "hozirgina";
  return formatDistanceToNowStrict(d, { locale: uz, addSuffix: true });
}

/** <input type="datetime-local"> uchun lokal "YYYY-MM-DDTHH:mm" */
export function toLocalInput(v: string | Date | null | undefined) {
  const d = toDate(v);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
}

/** datetime-local qiymatini ISO (UTC) ga aylantiradi */
export function fromLocalInput(s: string) {
  return new Date(s).toISOString();
}

export function pct(n: number | null | undefined) {
  return n == null ? "—" : `${n.toLocaleString("uz-UZ", { maximumFractionDigits: 1 })}%`;
}

export function todayLocalStr() {
  return format(new Date(), "yyyy-MM-dd");
}
