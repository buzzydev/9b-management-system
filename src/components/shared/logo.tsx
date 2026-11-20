import { cn } from "@/lib/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-[13px] font-bold tracking-tight text-primary-foreground shadow-sm">9-B</span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-sm font-semibold">9-B Management</span>
          <span className="block text-[11px] text-muted-foreground">Sinf boshqaruvi</span>
        </span>
      )}
    </span>
  );
}
