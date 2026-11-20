import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** PDF (Helvetika) uchun emas — faqat umumiy matn tozalash. */
export function clampText(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function formatPhone(p?: string | null) {
  return p ?? "—";
}
