"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { SWRConfig, mutate } from "swr";
import { Toaster } from "sonner";
import { useApi } from "./api";
import { translate, type DictKey } from "@/lib/i18n/dictionaries";
import { ConfirmProvider } from "@/components/ui/confirm";

export type Me = {
  user: {
    id: string;
    username: string;
    fullName: string;
    role: "ADMIN" | "TEACHER" | "CLASS_LEADER" | "ASSISTANT" | "GUEST";
    avatarUrl: string | null;
    email: string | null;
    phone: string | null;
    lastLoginAt: string | null;
    mustChangePassword: boolean;
  };
  settings: {
    theme: string;
    language: string;
    notifyAttendance: boolean;
    notifyHomework: boolean;
    notifyAnnouncements: boolean;
    notifyGrades: boolean;
    notifyTimetable: boolean;
    notifyEvents: boolean;
    notifyMessages: boolean;
    hiddenWidgets: string[];
  };
  counts: { notifications: number; messages: number };
  className: string;
  schoolName: string;
  timezone: string;
};

const MeCtx = createContext<{ me: Me | undefined; refresh: () => void }>({ me: undefined, refresh: () => {} });
export const useMe = () => useContext(MeCtx);
/** Tizimga kirmagan mehmon: faqat ko'rish; tahrirlash tugmalari yashiriladi (server baribir rad etadi). */
export const useReadOnly = () => useContext(MeCtx).me?.user.role === "GUEST";

const LangCtx = createContext<string>("uz");
export function useT() {
  const lang = useContext(LangCtx);
  return (key: DictKey) => translate(lang, key);
}

function ThemeSync({ theme }: { theme?: string }) {
  const { setTheme } = useTheme();
  const done = useRef(false);
  useEffect(() => {
    if (theme && !done.current) {
      done.current = true;
      setTheme(theme);
    }
  }, [theme, setTheme]);
  return null;
}

function MeProvider({ children }: { children: ReactNode }) {
  const { data, mutate: refresh } = useApi<Me>("/api/me", { refreshInterval: 30_000, revalidateOnFocus: true });
  const value = useMemo(() => ({ me: data, refresh: () => void refresh() }), [data, refresh]);
  return (
    <MeCtx.Provider value={value}>
      <LangCtx.Provider value={data?.settings.language ?? "uz"}>
        <ThemeSync theme={data?.user.role === "GUEST" ? undefined : data?.settings.theme} />
        {children}
      </LangCtx.Provider>
    </MeCtx.Provider>
  );
}

export function Providers({ children, authenticated }: { children: ReactNode; authenticated: boolean }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="ninebee-theme" disableTransitionOnChange={false}>
      <SWRConfig value={{ shouldRetryOnError: false, dedupingInterval: 2000 }}>
        <ConfirmProvider>
          {authenticated ? <MeProvider>{children}</MeProvider> : children}
          <Toaster richColors closeButton position="top-right" toastOptions={{ className: "font-sans" }} />
        </ConfirmProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}

/** Mutatsiyadan keyin mos kalitlarni qayta yuklaydi (prefiks bo'yicha). */
export function revalidatePrefix(...prefixes: string[]) {
  return mutate((key) => typeof key === "string" && prefixes.some((p) => key.startsWith(p)), undefined, { revalidate: true });
}
