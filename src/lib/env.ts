import path from "node:path";

const isProd = process.env.NODE_ENV === "production";

/** Getter'lar so'rov vaqtida o'qiladi — build paytida muhit o'zgaruvchilari shart emas. */
export const env = {
  isProd,
  get authSecret(): string {
    const s = process.env.AUTH_SECRET;
    if (s && s.length >= 32) return s;
    if (isProd) throw new Error("AUTH_SECRET o'rnatilmagan yoki 32 belgidan qisqa");
    return "dev-only-insecure-secret-change-me-0123456789";
  },
  get timezone() {
    return process.env.APP_TIMEZONE || "Asia/Tashkent";
  },
  get sessionHours() {
    const n = Number(process.env.SESSION_HOURS);
    return Number.isFinite(n) && n > 0 ? n : 8;
  },
  get storageDir() {
    return path.resolve(process.env.STORAGE_DIR || "./storage");
  },
  get className() {
    return process.env.CLASS_NAME || "9-B";
  },
  /** Ommaviy (mehmon) ko'rish rejimi: login talab qilinmaydi, faqat o'qish va maxfiy bo'lmagan ma'lumotlar. O'chirish: PUBLIC_ACCESS=false */
  get publicAccess() {
    return process.env.PUBLIC_ACCESS !== "false";
  },
  get trustProxy() {
    return process.env.TRUST_PROXY !== "false";
  },
};
