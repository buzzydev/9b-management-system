import { HttpError } from "./http-error";

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

/**
 * Xotirada ishlaydigan oynali cheklovchi (bitta Railway instansiyasi uchun yetarli).
 * Bir nechta replika kerak bo'lsa Redis'ga almashtiring.
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, remaining: 0, retryAfter: Math.ceil((b.reset - now) / 1000) };
  return { ok: true, remaining: limit - b.count, retryAfter: 0 };
}

export function enforceRate(key: string, limit: number, windowMs: number) {
  const r = rateLimit(key, limit, windowMs);
  if (!r.ok) {
    throw new HttpError(429, `Juda ko'p so'rov. ${r.retryAfter} soniyadan keyin urinib ko'ring`, "RATE_LIMIT", {
      "Retry-After": String(r.retryAfter),
    });
  }
}

export function resetRate(key: string) {
  buckets.delete(key);
}
