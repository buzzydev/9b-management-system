import { route, HttpError } from "@/lib/api";
import { UPLOAD_LIMITS, extOf, isAllowedFileExt, saveUpload, sniffImage } from "@/lib/storage";

// multipart/form-data: file, kind = "image" | "file"
export const POST = route({ cap: "class.manage", rate: { name: "upload", limit: 30, windowMs: 10 * 60_000 } }, async ({ req, log }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = form?.get("kind") === "image" ? "image" : "file";
  if (!(file instanceof File)) throw new HttpError(400, "Fayl topilmadi");
  const limit = kind === "image" ? UPLOAD_LIMITS.image : UPLOAD_LIMITS.file;
  if (file.size === 0) throw new HttpError(400, "Fayl bo'sh");
  if (file.size > limit) throw new HttpError(413, `Fayl hajmi ${Math.round(limit / 1024 / 1024)} MB dan oshmasligi kerak`);

  let ext = extOf(file.name);
  if (!isAllowedFileExt(ext, kind)) throw new HttpError(400, "Bu fayl turi qo'llab-quvvatlanmaydi");
  const buf = Buffer.from(await file.arrayBuffer());

  const isImageExt = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
  if (kind === "image" || isImageExt) {
    const real = sniffImage(buf);
    if (!real) throw new HttpError(400, "Fayl haqiqiy rasm emas");
    ext = real; // kengaytma emas, haqiqiy tur
  }
  const name = await saveUpload(buf, ext);
  await log({ action: "UPLOAD", category: "file", description: `Fayl yukladi: ${file.name.slice(0, 120)}`, entityType: "File", entityId: name });
  return { url: `/api/files/${name}`, name: file.name.slice(0, 200) };
});
