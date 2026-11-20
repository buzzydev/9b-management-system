"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, LogIn, LogOut, Settings, UserRound } from "lucide-react";
import { Avatar, Badge, ROLE_TONE } from "@/components/ui/feedback";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/menu";
import { api } from "@/lib/client/api";
import { useMe, useT } from "@/lib/client/providers";
import { cn } from "@/lib/utils";

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const t = useT();
  return (
    <Badge tone={ROLE_TONE[role] ?? "default"} className={className}>
      {t(`role.${role}` as any)}
    </Badge>
  );
}

export function UserMenu() {
  const { me } = useMe();
  const router = useRouter();
  const t = useT();
  if (!me) return <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />;
  if (me.user.role === "GUEST") {
    return (
      <Link href="/login" className="flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
        <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Xodimlar kirishi</span><span className="sm:hidden">Kirish</span>
      </Link>
    );
  }

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    window.location.assign("/login");
  };

  return (
    <Dropdown
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar name={me.user.fullName} src={me.user.avatarUrl} size={32} />
          <span className="hidden max-w-[140px] flex-col items-start text-left leading-tight md:flex">
            <span className="w-full truncate text-sm font-medium">{me.user.fullName}</span>
            <RoleBadge role={me.user.role} className="mt-0.5 px-1.5 py-0 text-[10px]" />
          </span>
          <ChevronDown className={cn("hidden h-4 w-4 text-muted-foreground transition-transform md:block", open && "rotate-180")} />
        </button>
      )}
      panelClassName="w-60"
    >
      {({ close }) => (
        <>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{me.user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">@{me.user.username}</p>
            <RoleBadge role={me.user.role} className="mt-1.5" />
          </div>
          <DropdownSeparator />
          <Link href="/profile" onClick={close} role="menuitem" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent">
            <UserRound className="h-4 w-4" /> {t("nav.profile")}
          </Link>
          <Link href="/settings" onClick={close} role="menuitem" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent">
            <Settings className="h-4 w-4" /> {t("common.accountSettings")}
          </Link>
          <DropdownSeparator />
          <DropdownItem destructive onClick={signOut}>
            <LogOut className="h-4 w-4" /> {t("common.signOut")}
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
