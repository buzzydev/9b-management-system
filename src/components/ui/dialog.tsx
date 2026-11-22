"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  side,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** true bo'lsa mobil qurilmada pastdan chiqadigan varaq */
  side?: boolean;
}) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button:not([data-dialog-close])");
      el?.focus();
    }, 30);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-[hsl(220_60%_4%/0.55)] backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-sheet-up flex-col rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-lg sm:animate-scale-in sm:rounded-2xl",
          side && "sm:max-w-md",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold leading-tight">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <Button data-dialog-close variant="ghost" size="icon-sm" onClick={onClose} aria-label="Yopish">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
