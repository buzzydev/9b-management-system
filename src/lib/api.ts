import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { Prisma, type Role } from "@prisma/client";
import { GUEST_USER, getSession, type SessionUser } from "./auth";
import { can, type Capability } from "./permissions";
import { HttpError } from "./http-error";
import { enforceRate } from "./rate-limit";
import { env } from "./env";
import { logActivity } from "./audit";

export { HttpError } from "./http-error";

export function clientIp(req: Request): string | null {
  if (!env.trustProxy) return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

/** CSRF: SameSite=Lax cookie + o'zgartiruvchi so'rovlarda Origin sarlavhasi shu host'ga mos bo'lishi shart. */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // brauzerdan tashqari (curl) — cookie bo'lmasa baribir rad etiladi
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let o: string;
  try {
    o = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Noto'g'ri so'rov manbasi");
  }
  if (o !== host) throw new HttpError(403, "Noto'g'ri so'rov manbasi (CSRF)");
}

export type LogInput = {
  action: string;
  category: string;
  description: string;
  entityType?: string;
  entityId?: string;
};

export type Ctx<B> = {
  req: NextRequest;
  session: SessionUser;
  body: B;
  query: URLSearchParams;
  params: Record<string, string>;
  ip: string | null;
  /** Audit jurnaliga yozadi (foydalanuvchi, rol, IP avtomatik) */
  log: (l: LogInput, client?: Prisma.TransactionClient) => Promise<void>;
};

type Opts<B> = {
  cap?: Capability;
  roles?: Role[];
  /** Tizimga kirmagan mehmon FAQAT GET so'rovda va faqat shu bayroq bilan kira oladi. Handler `session.role === "GUEST"` bo'lsa maxfiy maydonlarni olib tashlashi SHART. */
  guest?: boolean;
  body?: ZodType<B, any, any>;
  rate?: { name: string; limit: number; windowMs: number };
};

type Handler<B> = (ctx: Ctx<B>) => Promise<unknown>;

const NO_STORE = { "Cache-Control": "no-store" };

function errorResponse(e: unknown, req: NextRequest) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: { ...NO_STORE, ...e.headers } });
  }
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    const field = issue.path.join(".");
    return NextResponse.json(
      { error: field ? `${field}: ${issue.message}` : issue.message, code: "VALIDATION" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return NextResponse.json({ error: "Bunday yozuv allaqachon mavjud", code: "DUPLICATE" }, { status: 409, headers: NO_STORE });
    if (e.code === "P2025") return NextResponse.json({ error: "Yozuv topilmadi", code: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
    if (e.code === "P2003") return NextResponse.json({ error: "Bu yozuv boshqa ma'lumotlar bilan bog'langan", code: "IN_USE" }, { status: 409, headers: NO_STORE });
  }
  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandled",
      path: req.nextUrl.pathname,
      method: req.method,
      err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack?.split("\n").slice(0, 4) } : String(e),
    }),
  );
  return NextResponse.json({ error: "Server xatosi. Keyinroq urinib ko'ring", code: "SERVER" }, { status: 500, headers: NO_STORE });
}

/**
 * Barcha API route'lar shu orqali yoziladi: autentifikatsiya → ruxsat → CSRF → rate limit → validatsiya → xatolar.
 * Ruxsat tekshiruvi SERVERDA bajariladi (UI yashirishi xavfsizlik emas).
 */
export function route<B = undefined>(opts: Opts<B>, handler: Handler<B>) {
  return async (req: NextRequest, segment: { params: Promise<Record<string, string>> }) => {
    try {
      let session = await getSession();
      const isGuest = !session;
      if (!session) {
        // Mehmon: faqat ochiq rejim yoqilgan, route `guest: true` deb belgilangan va so'rov faqat o'qish bo'lsa
        if (opts.guest && env.publicAccess && (req.method === "GET" || req.method === "HEAD")) session = GUEST_USER;
        else throw new HttpError(401, "Tizimga kiring", "UNAUTHENTICATED");
      }
      if (!isGuest) {
        if (opts.cap && !can(session.role, opts.cap)) throw new HttpError(403, "Bu amal uchun ruxsatingiz yo'q", "FORBIDDEN");
        if (opts.roles && !opts.roles.includes(session.role as Role)) throw new HttpError(403, "Bu amal uchun ruxsatingiz yo'q", "FORBIDDEN");
      }

      const mutating = req.method !== "GET" && req.method !== "HEAD";
      if (mutating) assertSameOrigin(req);

      const ip = clientIp(req);
      // Umumiy himoya: foydalanuvchi bo'yicha daqiqasiga 240 ta so'rov
      enforceRate(isGuest ? `api:guest:${ip ?? "unknown"}` : `api:${session.id}`, isGuest ? 120 : 240, 60_000);
      if (opts.rate) enforceRate(`${opts.rate.name}:${isGuest ? (ip ?? "guest") : session.id}`, opts.rate.limit, opts.rate.windowMs);

      let body = undefined as B;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new HttpError(400, "So'rov tanasi noto'g'ri JSON");
        }
        body = opts.body.parse(raw);
      }

      const params = (await segment?.params) ?? ({} as Record<string, string>);
      const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;
      const ctx: Ctx<B> = {
        req,
        session,
        body,
        query: req.nextUrl.searchParams,
        params,
        ip,
        log: (l, client) =>
          logActivity({ ...l, user: session.role === "GUEST" ? null : (session as SessionUser & { role: Role }), ip, userAgent: ua, client }),
      };
      const result = await handler(ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: NO_STORE });
    } catch (e) {
      return errorResponse(e, req);
    }
  };
}

/**
 * Autentifikatsiyasiz (ochiq) route'lar uchun: login, QR skan, health.
 * CSRF + rate limit + validatsiya shu yerda; sessiya tekshirilmaydi.
 */
export function publicRoute<B = undefined>(
  opts: { body?: ZodType<B, any, any>; rate?: { name: string; limit: number; windowMs: number } },
  handler: (ctx: { req: NextRequest; body: B; query: URLSearchParams; ip: string | null }) => Promise<unknown>,
) {
  return async (req: NextRequest) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const ip = clientIp(req);
      if (opts.rate) enforceRate(`${opts.rate.name}:${ip ?? "unknown"}`, opts.rate.limit, opts.rate.windowMs);
      let body = undefined as B;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new HttpError(400, "So'rov tanasi noto'g'ri JSON");
        }
        body = opts.body.parse(raw);
      }
      const result = await handler({ req, body, query: req.nextUrl.searchParams, ip });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: NO_STORE });
    } catch (e) {
      return errorResponse(e, req);
    }
  };
}

/** `count === 0` bo'lsa 404 tashlaydi (updateMany/deleteMany natijasi uchun). */
export function notFoundIfEmpty(count: number, message = "Yozuv topilmadi") {
  if (count === 0) throw new HttpError(404, message);
}

/** Sahifalash parametrlarini xavfsiz o'qiydi. */
export function paging(q: URLSearchParams, defaultSize = 20, maxSize = 100) {
  const page = Math.max(1, parseInt(q.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(q.get("pageSize") ?? String(defaultSize), 10) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
