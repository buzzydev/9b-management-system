"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarDays, Megaphone, Search, User } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { useApi } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";
import { cn } from "@/lib/utils";

type Results = {
  students: { id: string; fullName: string; studentCode: string }[];
  announcements: { id: string; title: string }[];
  events: { id: string; title: string; startsAt: string }[];
  reports: { key: string; title: string }[];
};

type Row = { key: string; group: string; icon: typeof User; title: string; sub?: string; href: string };

function toRows(r?: Results): Row[] {
  if (!r) return [];
  return [
    ...r.students.map((s) => ({ key: `s${s.id}`, group: "O'quvchilar", icon: User, title: s.fullName, sub: s.studentCode, href: `/students/${s.id}` })),
    ...r.announcements.map((a) => ({ key: `a${a.id}`, group: "E'lonlar", icon: Megaphone, title: a.title, href: `/announcements?focus=${a.id}` })),
    ...r.events.map((e) => ({ key: `e${e.id}`, group: "Kalendar", icon: CalendarDays, title: e.title, sub: fmtDate(e.startsAt), href: `/calendar?date=${e.startsAt.slice(0, 10)}` })),
    ...r.reports.map((x) => ({ key: `r${x.key}`, group: "Hisobotlar", icon: BarChart3, title: x.title, href: `/reports?type=${x.key}` })),
  ];
}

export function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setDebounced("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const { data, isLoading } = useApi<Results>(open && debounced.length >= 2 ? `/api/search?q=${encodeURIComponent(debounced)}` : null);
  const rows = debounced.length >= 2 ? toRows(data) : [];

  useEffect(() => setActive(0), [debounced]);

  const go = (r: Row) => {
    onClose();
    router.push(r.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && rows[active]) go(rows[active]);
  };

  if (!open || typeof document === "undefined") return null;
  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Qidiruv" className="relative w-full max-w-xl animate-fade-in overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl" onKeyDown={onKey}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="O'quvchi, ID, uy vazifa, e'lon, tadbir…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {isLoading && debounced.length >= 2 ? <Spinner className="h-4 w-4" /> : <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">Esc</kbd>}
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {debounced.length < 2 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Qidirish uchun kamida 2 ta belgi kiriting</p>
          ) : !rows.length && !isLoading ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">“{debounced}” bo'yicha hech narsa topilmadi</p>
          ) : (
            rows.map((r, i) => {
              const header = r.group !== lastGroup;
              lastGroup = r.group;
              const Icon = r.icon;
              return (
                <div key={r.key}>
                  {header && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{r.group}</p>}
                  <button onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === active ? "bg-accent" : "hover:bg-accent/60")}>
                    <Icon className="h-4 w-4 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    {r.sub && <span className="shrink-0 truncate text-xs text-muted-foreground">{r.sub}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Navbar tugmasi + Ctrl/⌘+K va "/" yorliqlari */
export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-accent md:flex lg:w-72"
        aria-label="Qidirish"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Qidirish…</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Qidirish">
        <Search className="h-[18px] w-[18px]" />
      </Button>
      <CommandSearch open={open} onClose={() => setOpen(false)} />
    </>
  );
}
