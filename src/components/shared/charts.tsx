"use client";

import type { ReactNode } from "react";

/** Recharts uchun CSS o'zgaruvchilariga bog'langan ranglar (yorug'/qorong'u rejimga moslashadi) */
export const C = {
  brand: "hsl(var(--chart-1))",
  green: "hsl(var(--chart-2))",
  amber: "hsl(var(--chart-3))",
  blue: "hsl(var(--chart-4))",
  purple: "hsl(var(--chart-5))",
  red: "hsl(var(--destructive))",
  grid: "hsl(var(--border))",
  text: "hsl(var(--muted-foreground))",
};

export const STATUS_COLOR: Record<string, string> = {
  PRESENT: "hsl(var(--success))",
  ABSENT: "hsl(var(--destructive))",
  LATE: "hsl(var(--warning))",
  EXCUSED: "hsl(var(--info))",
  ESCAPED: "#a855f7",
};

export const axisProps = { stroke: C.text, fontSize: 12, tickLine: false, axisLine: false } as const;

type TipProps = {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  suffix?: string;
  nameMap?: Record<string, string>;
};

export function ChartTooltip({ active, payload, label, suffix = "", nameMap }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      {label !== undefined && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{nameMap?.[String(p.dataKey)] ?? p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-foreground">
            {p.value}
            {suffix}
          </span>
        </p>
      ))}
    </div>
  );
}

export function ChartBox({ height = 240, children }: { height?: number; children: ReactNode }) {
  return <div style={{ height }} className="w-full">{children}</div>;
}
