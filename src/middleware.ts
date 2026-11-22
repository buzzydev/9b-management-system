import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE, isPublicPath, isStaffOnlyPath } from "@/lib/session-constants";

// Birinchi qatlam: imzo va muddatni tekshiradi. Foydalanuvchi faolligi, rol va parol
// muhri serverda (getSession) har so'rovda bazadan qayta tekshiriladi.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let valid = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      valid = true;
    } catch {
      valid = false;
    }
  } else if (token && process.env.NODE_ENV !== "production") {
    // dev rejimida AUTH_SECRET bo'lmasa lib/env.ts dagi zaxira kalit ishlatiladi
    try {
      await jwtVerify(token, new TextEncoder().encode("dev-only-insecure-secret-change-me-0123456789"));
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (valid) return NextResponse.next();

  // Ochiq (mehmon) rejim: API'ni o'zi (route() ichida) himoyalaydi — faqat `guest: true` GET'lar ochiq.
  // Sahifalardan esa faqat xodimlar uchun bo'lganlari /login ga qaytariladi.
  const publicAccess = process.env.PUBLIC_ACCESS !== "false";
  if (publicAccess && (pathname.startsWith("/api/") || !isStaffOnlyPath(pathname))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Tizimga kiring" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|images/|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
