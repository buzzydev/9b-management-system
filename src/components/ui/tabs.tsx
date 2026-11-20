"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type TabItem<T extends string = string> = { value: T; label: React.ReactNode; badge?: React.ReactNode };

/** Gorizontal tablar (mobil'da aylantiriladi). */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: TabItem<T>[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-1", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === it.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {it.label}
          {it.badge}
        </button>
      ))}
    </div>
  );
}
