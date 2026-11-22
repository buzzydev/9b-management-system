import * as React from "react";
import Image from "next/image";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} aria-label="Yuklanmoqda" />;
}

const badgeTones = {
  default: "bg-secondary text-secondary-foreground",
  brand: "bg-brand/15 text-brand",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
  outline: "border border-border text-muted-foreground",
} as const;
export type Tone = keyof typeof badgeTones;

export function Badge({ tone = "default", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone], className)} {...props} />;
}

export const STATUS_TONE: Record<string, Tone> = { PRESENT: "success", ABSENT: "danger", LATE: "warning", EXCUSED: "info", ESCAPED: "danger" };
export const PRIORITY_TONE: Record<string, Tone> = { NORMAL: "default", IMPORTANT: "warning", URGENT: "danger" };
export const ROLE_TONE: Record<string, Tone> = { ADMIN: "danger", TEACHER: "brand", CLASS_LEADER: "info", ASSISTANT: "default", GUEST: "default" };

export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-brand/15 text-xs font-semibold text-brand", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      aria-label={name}
    >
      {src ? <Image src={src} alt={name} width={size} height={size} unoptimized className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "success" | "warning" | "danger"; className?: string }) {
  const color = { brand: "bg-brand", success: "bg-success", warning: "bg-warning", danger: "bg-destructive" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function EmptyState({
  title = "Ma'lumot topilmadi",
  description,
  icon: Icon,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-12 text-center", className)}>
      {Icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-brand">
          <Icon className="h-6 w-6" />
        </div>
      ) : (
        <Image src="/images/empty-state.webp" alt="" width={168} height={126} className="h-auto w-40 select-none opacity-95" />
      )}
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message = "Ma'lumotlarni yuklab bo'lmadi", onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 px-4 py-12 text-center", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}

/** Jadval/ro'yxat uchun skeleton satrlar */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
