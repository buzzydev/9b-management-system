import { cn } from "@/lib/utils";

export function Logo({ className, compact, tone = "auto" }: { className?: string; compact?: boolean; tone?: "auto" | "light" }) {
  const light = tone === "light";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="gradient-brand relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl text-[13px] font-bold tracking-tight text-white shadow-sm ring-1 ring-white/20">
        <span className="absolute -right-2 -top-3 h-6 w-6 rounded-full bg-white/25 blur-[2px]" aria-hidden />
        <span className="relative">9-B</span>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className={cn("block text-sm font-semibold tracking-tight", light && "text-sidebar-foreground")}>9-B Management</span>
          <span className={cn("block text-[11px]", light ? "text-sidebar-muted" : "text-muted-foreground")}>Sinf boshqaruvi</span>
        </span>
      )}
    </span>
  );
}
