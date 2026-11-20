import { NextResponse } from "next/server";
import { getSession, destroySession } from "@/lib/auth";
import { clientIp } from "@/lib/api";
import { logActivity } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (session) {
    await logActivity({ user: session, action: "LOGOUT", category: "auth", description: "Tizimdan chiqdi", entityType: "User", entityId: session.id, ip: clientIp(req), userAgent: req.headers.get("user-agent")?.slice(0, 200) });
  }
  await destroySession();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
