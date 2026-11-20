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
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110", active && "scale-105")} />
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
        <div className="mt-3 border-t border-border pt-3">
          <Link href="/login" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            <LogIn className="h-[18px] w-[18px]" /> Xodimlar uchun kirish
          </Link>
        </div>
      )}
      {isAdmin && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            onClick={() => setAdminOpen((o) => !o)}
            aria-expanded={adminOpen}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ShieldCheck className="h-[18px] w-[18px]" />
            <span className="flex-1 text-left">{t("nav.admin")}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", adminOpen && "rotate-180")} />
          </button>
          {adminOpen && (
            <div className="ml-3 mt-1 flex animate-fade-in flex-col gap-1 border-l border-border pl-2">
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-[hsl(var(--sidebar))] lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/dashboard" aria-label="Bosh sahifa">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          <NavList />
        </div>
        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <p className="truncate font-medium text-foreground">{me?.schoolName ?? "—"}</p>
          <p>Sinf: {me?.className ?? "9-B"}</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={() => setDrawer(false)} />
          <div role="dialog" aria-modal="true" aria-label="Menyu" className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs animate-fade-in flex-col bg-[hsl(var(--sidebar))] shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Logo />
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 hover:bg-accent" aria-label="Yopish">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <NavList onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:h-16 sm:gap-3 sm:px-6">
          <Link href="/dashboard" className="lg:hidden" aria-label="Bosh sahifa">
            <Logo compact />
          </Link>
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{t(titleKeyFor(pathname))}</h2>
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
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-md lg:hidden" aria-label="Pastki navigatsiya">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {bottom.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            const Icon = n.icon;
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors", active ? "text-brand" : "text-muted-foreground")}>
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary")}>
                    <Icon className={cn("h-5 w-5", active && "text-primary-foreground")} />
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
      <Link href="/login" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"><LogIn className="h-4 w-4" /> Kirish</Link>
    </div>
  );
}
