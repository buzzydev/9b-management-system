import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storageStatus } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Railway healthcheck: bazaga ulanishni tekshiradi. Maxfiy ma'lumot qaytarmaydi.
export async function GET() {
  const started = Date.now();
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "health-db-failed", err: String(e) }));
  }
  const storage = await storageStatus();
  const ok = dbOk; // saqlash ogohlantirish — healthcheck'ni yiqitmaydi
  return NextResponse.json(
    { status: ok ? "ok" : "error", db: dbOk ? "up" : "down", storage: storage.writable ? "writable" : "unavailable", latencyMs: Date.now() - started, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
