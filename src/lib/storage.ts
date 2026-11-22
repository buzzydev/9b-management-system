import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { env } from "./env";

export const UPLOAD_LIMITS = { image: 3 * 1024 * 1024, file: 10 * 1024 * 1024 };

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const FILE_EXT = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip", "png", "jpg", "jpeg", "webp", "gif"]);

export const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  zip: "application/zip",
};

export const uploadsDir = () => path.join(env.storageDir, "uploads");
export const backupsDir = () => path.join(env.storageDir, "backups");

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

/** Fayl boshidagi baytlar bo'yicha haqiqiy rasm turini aniqlaydi (kengaytmaga ishonmaydi). */
export function sniffImage(buf: Buffer): "png" | "jpg" | "webp" | "gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.toString("ascii", 0, 3) === "GIF") return "gif";
  return null;
}

export function extOf(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

export function isAllowedFileExt(ext: string, kind: "image" | "file") {
  return kind === "image" ? IMAGE_EXT.has(ext) : FILE_EXT.has(ext);
}

/** Faylni saqlaydi va ochiq nom (tasodifiy) qaytaradi. */
export async function saveUpload(buf: Buffer, ext: string): Promise<string> {
  await ensureDir(uploadsDir());
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(uploadsDir(), name), buf, { mode: 0o640 });
  return name;
}

const SAFE_NAME = /^[a-f0-9]{32}\.[a-z0-9]{2,5}$/;

export function isSafeUploadName(name: string) {
  return SAFE_NAME.test(name);
}

export async function readUpload(name: string): Promise<Buffer | null> {
  if (!isSafeUploadName(name)) return null;
  try {
    return await fs.readFile(path.join(uploadsDir(), name));
  } catch {
    return null;
  }
}

export async function storageStatus(): Promise<{ writable: boolean; dir: string; error?: string }> {
  try {
    await ensureDir(env.storageDir);
    const probe = path.join(env.storageDir, `.probe-${process.pid}`);
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    return { writable: true, dir: env.storageDir };
  } catch (e) {
    return { writable: false, dir: env.storageDir, error: e instanceof Error ? e.message : String(e) };
  }
}
