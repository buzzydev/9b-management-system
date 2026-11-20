// Edge-xavfsiz (middleware ham import qiladi) — Node modullarini import qilmang.
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ninebee_session" : "ninebee_session";

export const PUBLIC_PATHS = ["/login", "/scan", "/api/auth/login", "/api/scan", "/api/health"];

/**
 * Mehmon (ommaviy) rejimida ham FAQAT xodimlar uchun bo'lgan sahifalar. Middleware shularga
 * cookie'siz kirishni /login ga qaytaradi; ma'lumotlarni esa API serverda alohida himoyalaydi.
 */
export const STAFF_ONLY_PREFIXES = ["/reports", "/messages", "/logs", "/notifications", "/settings", "/profile", "/admin", "/escapes", "/students/"];

export function isStaffOnlyPath(pathname: string) {
  return STAFF_ONLY_PREFIXES.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")));
}

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
