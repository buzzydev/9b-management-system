import Papa from "papaparse";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, getClass } from "@/lib/db";
import { route, HttpError } from "@/lib/api";
import { fmtDay, isDayString, parseDay, today } from "@/lib/dates";
import { nextCodes } from "@/lib/services/students";
import { extOf } from "@/lib/storage";

const MAX_ROWS = 500;
const MAX_BYTES = 2 * 1024 * 1024;

const ALIASES: Record<string, string> = {
  fullname: "fullName", name: "fullName", ism: "fullName", fio: "fullName", ismi: "fullName", "toliqismi": "fullName", familiyaism: "fullName",
  dateofbirth: "dateOfBirth", birthdate: "dateOfBirth", dob: "dateOfBirth", tugilgansana: "dateOfBirth", tugilganyil: "dateOfBirth",
  phone: "phone", telefon: "phone", tel: "phone",
  parentphone: "parentPhone", ota_onatelefon: "parentPhone", ota_onatelefoni: "parentPhone", ota_ona: "parentPhone", ota_onatel: "parentPhone", ota: "parentPhone",
  studentcode: "studentCode", studentid: "studentCode", id: "studentCode", code: "studentCode",
};

const normHeader = (h: string) => h.toLowerCase().replace(/[\s'‘’ʻʼ`.\-/]+/g, "");
const rowSchema = z.object({
  fullName: z.string().trim().min(2, "Ism kamida 2 belgi").max(120),
  studentCode: z.string().trim().max(32).regex(/^[A-Za-z0-9._-]*$/, "ID noto'g'ri belgilar").optional(),
  phone: z.string().trim().max(32).regex(/^[+\d\s()\-]{5,32}$/, "Telefon noto'g'ri").optional(),
  parentPhone: z.string().trim().max(32).regex(/^[+\d\s()\-]{5,32}$/, "Ota-ona telefoni noto'g'ri").optional(),
});

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; richText?: { text: string }[]; result?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("").trim();
    if (o.text != null) return String(o.text).trim();
    if (o.result != null) return cellText(o.result);
    return "";
  }
  return String(v).trim();
}

/** YYYY-MM-DD yoki DD.MM.YYYY / DD/MM/YYYY → YYYY-MM-DD (aks holda null) */
function parseDob(s: string): string | null {
  if (!s) return null;
  const candidate: string = s;
  if (isDayString(candidate)) return candidate;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isDayString(iso) ? iso : null;
  }
  return null;
}

type Raw = Record<string, string>;

async function readRows(file: File): Promise<Raw[]> {
  const ext = extOf(file.name);
  const buf = Buffer.from(await file.arrayBuffer());
  const rows: Raw[] = [];
  const mapKeys = (obj: Record<string, unknown>): Raw => {
    const out: Raw = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = ALIASES[normHeader(k)];
      if (key) out[key] = cellText(v);
    }
    return out;
  };
  if (ext === "csv" || ext === "txt") {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: "greedy" });
    for (const r of parsed.data) rows.push(mapKeys(r));
  } else if (ext === "xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new HttpError(400, "Excel faylda varaq topilmadi");
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i] = cellText(c.value)));
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = row.getCell(i).value;
      });
      if (Object.values(obj).some((v) => cellText(v))) rows.push(mapKeys(obj));
    }
  } else {
    throw new HttpError(400, "Faqat .csv yoki .xlsx fayl qabul qilinadi");
  }
  return rows;
}

export const POST = route({ cap: "class.manage", rate: { name: "student-import", limit: 10, windowMs: 10 * 60_000 } }, async ({ req, log }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Fayl topilmadi");
  if (file.size === 0 || file.size > MAX_BYTES) throw new HttpError(400, "Fayl hajmi 2 MB dan oshmasligi kerak");

  const rows = await readRows(file);
  if (!rows.length) throw new HttpError(400, "Faylda ma'lumot qatorlari topilmadi. Birinchi qator sarlavha bo'lishi kerak (fullName, dateOfBirth, phone, parentPhone, studentCode)");
  if (rows.length > MAX_ROWS) throw new HttpError(400, `Bir martada ko'pi bilan ${MAX_ROWS} ta qator import qilinadi`);

  const cls = await getClass();
  const todayStr = fmtDay(today());
  const errors: { row: number; message: string }[] = [];
  const valid: { row: number; fullName: string; code?: string; dob: string | null; phone: string | null; parentPhone: string | null }[] = [];
  const seenCodes = new Set<string>();

  rows.forEach((r, idx) => {
    const rowNo = idx + 2; // 1-qator — sarlavha
    const parsed = rowSchema.safeParse({
      fullName: r.fullName ?? "",
      studentCode: r.studentCode || undefined,
      phone: r.phone || undefined,
      parentPhone: r.parentPhone || undefined,
    });
    if (!parsed.success) return void errors.push({ row: rowNo, message: parsed.error.issues[0].message });
    let dob: string | null = null;
    if (r.dateOfBirth) {
      dob = parseDob(r.dateOfBirth);
      if (!dob) return void errors.push({ row: rowNo, message: "Tug'ilgan sana formati noto'g'ri (YYYY-MM-DD yoki DD.MM.YYYY)" });
      if (dob >= todayStr) return void errors.push({ row: rowNo, message: "Tug'ilgan sana kelajakda" });
    }
    const code = parsed.data.studentCode ? parsed.data.studentCode.toUpperCase() : undefined;
    if (code) {
      if (seenCodes.has(code)) return void errors.push({ row: rowNo, message: `ID “${code}” faylda takrorlangan` });
      seenCodes.add(code);
    }
    valid.push({ row: rowNo, fullName: parsed.data.fullName, code, dob, phone: parsed.data.phone ?? null, parentPhone: parsed.data.parentPhone ?? null });
  });

  let created = 0;
  let skipped = 0;
  if (valid.length) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await prisma.$transaction(
          async (tx) => {
            const explicit = valid.filter((v) => v.code).map((v) => v.code!);
            const existing = new Set((await tx.student.findMany({ where: { studentCode: { in: explicit } }, select: { studentCode: true } })).map((s) => s.studentCode));
            const toCreate = valid.filter((v) => {
              if (v.code && existing.has(v.code)) {
                errors.push({ row: v.row, message: `ID “${v.code}” bazada mavjud — o'tkazib yuborildi` });
                skipped++;
                return false;
              }
              return true;
            });
            const needCodes = toCreate.filter((v) => !v.code);
            const generated = needCodes.length ? await nextCodes(tx, needCodes.length) : [];
            let gi = 0;
            const data: Prisma.StudentCreateManyInput[] = toCreate.map((v) => ({
              classId: cls.id,
              studentCode: v.code ?? generated[gi++],
              fullName: v.fullName,
              dateOfBirth: v.dob ? parseDay(v.dob) : null,
              phone: v.phone,
              parentPhone: v.parentPhone,
            }));
            const r = data.length ? await tx.student.createMany({ data }) : { count: 0 };
            await log({ action: "STUDENT_IMPORT", category: "student", description: `Import: ${r.count} ta o'quvchi qo'shildi, ${skipped} ta o'tkazib yuborildi, ${errors.length} ta xato (${file.name.slice(0, 80)})`, entityType: "Student" }, tx);
            return r.count;
          },
          { timeout: 30_000 },
        );
        created = res;
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) {
          // avtomatik ID poygasi: qayta urinish uchun hisoblagichlarni tiklaymiz
          skipped = 0;
          errors.splice(0, errors.length, ...errors.filter((x) => !x.message.includes("bazada mavjud")));
          continue;
        }
        throw e;
      }
    }
  }

  errors.sort((a, b) => a.row - b.row);
  return { created, skipped, errors, total: rows.length };
});
