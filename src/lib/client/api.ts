"use client";

import useSWR, { mutate, type SWRConfiguration } from "swr";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(
  url: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body || opts.form ? "POST" : "GET");
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Tarmoq xatosi. Internetni tekshiring");
  }
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
  }
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("application/json") ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "Xatolik yuz berdi", data?.code);
  return data as T;
}

export const fetcher = (url: string) => api(url);

/** GET so'rovlari uchun SWR (keshlash, dedup, qayta tekshirish). `null` URL — so'rov yuborilmaydi. */
export function useApi<T = any>(url: string | null, config?: SWRConfiguration) {
  return useSWR<T>(url, fetcher, { revalidateOnFocus: false, keepPreviousData: true, ...config });
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Xatolik yuz berdi";
}

/** Faylni (rasm/hujjat) yuklaydi va `/api/files/...` manzilini qaytaradi. */
export async function uploadFile(file: File, kind: "image" | "file" = "file") {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return api<{ url: string; name: string }>("/api/upload", { form });
}

export function downloadUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Mutatsiyadan keyin mos SWR kalitlarini (prefiks bo'yicha) qayta yuklaydi. */
export function revalidatePrefix(...prefixes: string[]) {
  return mutate((key) => typeof key === "string" && prefixes.some((p) => key.startsWith(p)), undefined, { revalidate: true });
}
