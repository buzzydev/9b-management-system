import { z } from "zod";
import { isDayString } from "./dates";

export const dayString = z.string().refine(isDayString, "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
export const optionalDay = z
  .union([dayString, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const cleaned = (max: number) => z.string().trim().max(max);

export const phone = z
  .union([z.string().trim().max(32).regex(/^[+\d\s()\-]{5,32}$/, "Telefon raqami noto'g'ri"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const optionalText = (max = 1000) =>
  z
    .union([cleaned(max), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

export const requiredText = (max = 200) => cleaned(max).min(1, "Majburiy maydon");

export const id = z.string().min(1).max(64);

export const attachmentList = z
  .array(
    z.object({
      name: z.string().min(1).max(200),
      url: z.string().regex(/^\/api\/files\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/, "Noto'g'ri fayl manzili"),
    }),
  )
  .max(10)
  .optional();

export const photoUrl = z
  .union([z.string().regex(/^\/api\/files\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/, "Noto'g'ri rasm manzili"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const roleEnum = z.enum(["ADMIN", "TEACHER", "CLASS_LEADER", "ASSISTANT"]);
// DIQQAT: ESCAPED bu yerda yo'q — «Qochib ketdi» holatini faqat /api/escapes (admin + tasdiq) qo'yadi.
export const attendanceStatusEnum = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
export const priorityEnum = z.enum(["NORMAL", "IMPORTANT", "URGENT"]);
export const eventTypeEnum = z.enum(["EXAM", "TEST", "DEADLINE", "SCHOOL_EVENT", "MEETING", "HOLIDAY", "ANNOUNCEMENT"]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Kamida 3 belgi")
  .max(32)
  .regex(/^[a-z0-9._-]+$/, "Faqat lotin harflari, raqam, nuqta, tire va pastki chiziq");
