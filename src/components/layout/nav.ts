import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Clock,
  ClipboardList,
  CalendarDays,
  Megaphone,
  BarChart3,
  MessageSquare,
  ScrollText,
  Settings,
  UserCog,
  SlidersHorizontal,
  DatabaseBackup,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { DictKey } from "@/lib/i18n/dictionaries";

export type NavItem = { href: string; key: DictKey; icon: LucideIcon; admin?: boolean };

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/students", key: "nav.students", icon: Users },
  { href: "/attendance", key: "nav.attendance", icon: CalendarCheck },
  { href: "/timetable", key: "nav.timetable", icon: Clock },
  { href: "/duty", key: "nav.duty", icon: ClipboardList },
  { href: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { href: "/announcements", key: "nav.announcements", icon: Megaphone },
  { href: "/reports", key: "nav.reports", icon: BarChart3 },
  { href: "/messages", key: "nav.messages", icon: MessageSquare },
  { href: "/escapes", key: "nav.escapes", icon: UserX },
  { href: "/logs", key: "nav.logs", icon: ScrollText },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", key: "nav.users", icon: UserCog, admin: true },
  { href: "/admin/system", key: "nav.system", icon: SlidersHorizontal, admin: true },
  { href: "/admin/backup", key: "nav.backup", icon: DatabaseBackup, admin: true },
];

/** Tizimga kirmagan mehmon ko'ra oladigan bo'limlar (maxfiy ma'lumotlar serverda ham yopiq). */
export const GUEST_NAV = ["/dashboard", "/students", "/attendance", "/duty", "/timetable", "/calendar", "/announcements"];

/** Mobil pastki navigatsiya: 4 asosiy + "Yana" */
export const BOTTOM_NAV = ["/dashboard", "/students", "/attendance", "/duty"];
export const GUEST_BOTTOM_NAV = ["/dashboard", "/attendance", "/duty", "/timetable"];

export function titleKeyFor(pathname: string): DictKey {
  const all = [...MAIN_NAV, ...ADMIN_NAV];
  const hit = all.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  if (hit) return hit.key;
  if (pathname.startsWith("/profile")) return "nav.profile";
  if (pathname.startsWith("/notifications")) return "nav.notifications";
  return "app.name";
}
