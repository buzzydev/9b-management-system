import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { MIME, extOf, readUpload } from "@/lib/storage";

// Yuklangan fayllar faqat tizimga kirgan foydalanuvchilarga beriladi.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Tizimga kiring" }, { status: 401 });
  const { name } = await params;
  const buf = await readUpload(name);
  if (!buf) return NextResponse.json({ error: "Fayl topilmadi" }, { status: 404 });
  const ext = extOf(name);
  const type = MIME[ext] ?? "application/octet-stream";
  const inline = type.startsWith("image/") || ext === "pdf";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(buf.length),
      "Content-Disposition": inline ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
