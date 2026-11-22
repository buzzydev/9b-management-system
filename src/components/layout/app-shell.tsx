"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogIn, MoreHorizontal, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/logo";
import { Badge } from "@/components/ui/feedback";
import { isStaffOnlyPath } from "@/lib/session-constants";
import { useMe, useT } from "@/lib/client/providers";
import { ADMIN_NAV, BOTTOM_NAV, GUEST_BOTTOM_NAV, GUEST_NAV, MAIN_NAV, titleKeyFor, type NavItem } from "./nav";
import { SearchTrigger } from "./command-search";
import { NotificationBell } from "./notification-bell";
import { ThemeSwitcher } from "./theme-switcher";
import { UserMenu } from "./user-menu";

function NavLink({ item, onNavigate, badge }: { item: NavItem; onNavigate?: () => void; badge?: number }) {
  const pathname = usePathname();
  const t = useT();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        active ? "bg-sidebar-accent text-white shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.25)]" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {active && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-cyan-300 to-teal-400" aria-hidden />}
      <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110", active ? "text-cyan-300" : "")} />
      <span className="flex-1 truncate">{t(item.key)}</span>
      {!!badge && <span className="rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-4 text-destructive-foreground">{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useMe();
  const t = useT();
  const pathname = usePathname();
  const isAdmin = me?.user.role === "ADMIN";
  const guest = me?.user.role === "GUEST";
  const items = guest ? MAIN_NAV.filter((n) => GUEST_NAV.includes(n.href)) : MAIN_NAV;
  const adminActive = ADMIN_NAV.some((n) => pathname.startsWith(n.href));
  const [adminOpen, setAdminOpen] = useState(adminActive);
  useEffect(() => {
    if (adminActive) setAdminOpen(true);
  }, [adminActive]);

  return (
    <nav className="flex flex-col gap-1" aria-label="Asosiy navigatsiya">
      {items.map((n) => (
        <NavLink key={n.href} item={n} onNavigate={onNavigate} badge={n.href === "/messages" ? me?.counts.messages : undefined} />
      ))}
      {guest && (
        <div className="mt-3 border-t border-sidebar-border pt-3">
          <Link href="/login" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground">
            <LogIn className="h-[18px] w-[18px]" /> Xodimlar uchun kirish
          </Link>
        </div>
      )}
      {isAdmin && (
        <div className="mt-3 border-t border-sidebar-border pt-3">
          <button
            onClick={() => setAdminOpen((o) => !o)}
            aria-expanded={adminOpen}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <ShieldCheck className="h-[18px] w-[18px]" />
            <span className="flex-1 text-left">{t("nav.admin")}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", adminOpen && "rotate-180")} />
          </button>
          {adminOpen && (
            <div className="ml-3 mt-1 flex animate-fade-in flex-col gap-1 border-l border-sidebar-border pl-2">
              {ADMIN_NAV.map((n) => (
                <NavLink key={n.href} item={n} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();
  const t = useT();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const guest = me?.user.role === "GUEST";
  const bottom = MAIN_NAV.filter((n) => (guest ? GUEST_BOTTOM_NAV : BOTTOM_NAV).includes(n.href));
  const blocked = guest && isStaffOnlyPath(pathname);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(20rem_12rem_at_20%_-10%,hsl(var(--glow)/0.22),transparent)]" aria-hidden />
        <div className="relative flex h-16 items-center border-b border-sidebar-border px-5">
          <Link href="/dashboard" aria-label="Bosh sahifa">
            <Logo tone="light" />
          </Link>
        </div>
        <div className="relative flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
          <NavList />
        </div>
        <div className="relative border-t border-sidebar-border px-5 py-3.5 text-xs text-sidebar-muted">
          <p className="truncate font-medium text-sidebar-foreground">{me?.schoolName ?? "—"}</p>
          <p>Sinf: {me?.className ?? "9-B"}</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <div className="absolute inset-0 animate-fade-in bg-[hsl(220_60%_4%/0.6)] backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div role="dialog" aria-modal="true" aria-label="Menyu" className="safe-top absolute inset-y-0 left-0 flex w-[84%] max-w-xs animate-slide-in-left flex-col bg-sidebar text-sidebar-foreground shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
              <Logo tone="light" />
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2.5 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Yopish">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 safe-bottom">
              <NavList onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="safe-top sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-border/70 bg-background/75 px-3 backdrop-blur-xl sm:min-h-16 sm:gap-3 sm:px-6">
          <Link href="/dashboard" className="lg:hidden" aria-label="Bosh sahifa">
            <Logo compact />
          </Link>
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight sm:text-lg">{t(titleKeyFor(pathname))}</h2>
          {!guest && <SearchTrigger />}
          {!guest && <NotificationBell />}
          <ThemeSwitcher />
          <UserMenu />
        </header>

        {me?.user.mustChangePassword && (
          <div className="border-b border-warning/30 bg-warning/15 px-4 py-2 text-center text-sm">
            Xavfsizlik uchun parolingizni o'zgartiring.{" "}
            <Link href="/settings?tab=security" className="font-semibold underline">
              Parolni o'zgartirish
            </Link>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{blocked ? <StaffOnly /> : children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/85 shadow-[0_-8px_30px_-12px_hsl(var(--shadow)/0.25)] backdrop-blur-xl lg:hidden" aria-label="Pastki navigatsiya">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {bottom.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            const Icon = n.icon;
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors", active ? "text-brand" : "text-muted-foreground")}>
                  <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200", active && "gradient-brand shadow-sm")}>
                    <Icon className={cn("h-5 w-5", active && "text-white")} />
                  </span>
                  <span className="max-w-full truncate px-1">{t(n.key)}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => setDrawer(true)} className="flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground">
              <span className="relative flex h-7 w-12 items-center justify-center">
                <MoreHorizontal className="h-5 w-5" />
                {!!me?.counts.messages && <Badge tone="danger" className="absolute -right-0 -top-1 px-1.5 py-0 text-[9px]">{me.counts.messages}</Badge>}
              </span>
              {t("nav.more")}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function StaffOnly() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <ShieldCheck className="mx-auto h-10 w-10 text-brand" />
      <h3 className="mt-3 text-lg font-semibold">Bu bo'lim faqat xodimlar uchun</h3>
      <p className="mt-1 text-sm text-muted-foreground">Davomat, baholar, hisobotlar va boshqaruv funksiyalari tizimga kirgan xodimlar uchun ochiq.</p>
      <Link href="/login" className="gradient-brand mt-5 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-medium text-white hover:brightness-105"><LogIn className="h-4 w-4" /> Kirish</Link>
    </div>
  );
}
