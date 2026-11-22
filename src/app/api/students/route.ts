import { Prisma } from "@prisma/client";
import { prisma, getClass } from "@/lib/db";
import { route, paging, HttpError } from "@/lib/api";
import { parseDay } from "@/lib/dates";
import { assertDobValid, attendanceMap, nextCodes, serializeStudent, studentInput, studentWhere } from "@/lib/services/students";

const SORTS = ["fullName", "studentCode", "enrolledAt", "attendance"];

export const GET = route({ cap: "class.manage", guest: true }, async ({ query, session }) => {
  const cls = await getClass();
  if (session.role === "GUEST") {
    // Mehmon: faqat faol o'quvchilarning ismi. Telefon, tug'ilgan sana, ID, rasm, davomat, baho va h.k. UMUMAN qaytarilmaydi.
    const q = (query.get("q") ?? "").trim().slice(0, 80);
    const { page, pageSize, skip, take } = paging(query, 40, 100);
    const where = { classId: cls.id, status: "ACTIVE" as const, ...(q ? { fullName: { contains: q, mode: "insensitive" as const } } : {}) };
    const [rows, total] = await Promise.all([
      prisma.student.findMany({ where, orderBy: { fullName: "asc" }, skip, take, select: { id: true, fullName: true } }),
      prisma.student.count({ where }),
    ]);
    return { guest: true, items: rows, total, page, pageSize };
  }
  const where = studentWhere(query, cls.id);
  const { page, pageSize, skip, take } = paging(query, 20, 100);
  const sortRaw = query.get("sort") ?? "fullName";
  const sort = SORTS.includes(sortRaw) ? sortRaw : "fullName";
  const dir: "asc" | "desc" = query.get("dir") === "desc" ? "desc" : "asc";

  let items;
  let total: number;
  if (sort === "attendance") {
    // Davomat foizi hisoblangan qiymat — sinf kichik, shuning uchun xotirada saralanadi
    const all = await prisma.student.findMany({ where, orderBy: { fullName: "asc" } });
    const map = await attendanceMap(all.map((s) => s.id));
    const sorted = all.sort((a, b) => {
      const ra = map.get(a.id)!.rate;
      const rb = map.get(b.id)!.rate;
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return dir === "asc" ? ra - rb : rb - ra;
    });
    total = sorted.length;
    items = sorted.slice(skip, skip + take).map((s) => serializeStudent(s, { attendanceRate: map.get(s.id)!.rate, counts: map.get(s.id)!.counts }));
  } else {
    const [rows, count] = await Promise.all([
      prisma.student.findMany({ where, orderBy: [{ [sort]: dir }, { id: "asc" }], skip, take }),
      prisma.student.count({ where }),
    ]);
    const map = await attendanceMap(rows.map((s) => s.id));
    total = count;
    items = rows.map((s) => serializeStudent(s, { attendanceRate: map.get(s.id)!.rate, counts: map.get(s.id)!.counts }));
  }

  const groups = await prisma.student.groupBy({ by: ["status"], where: { classId: cls.id }, _count: { _all: true } });
  const totals = { active: 0, archived: 0 };
  for (const g of groups) if (g.status === "ACTIVE") totals.active = g._count._all;
  else totals.archived = g._count._all;

  return { items, total, page, pageSize, totals };
});

export const POST = route({ cap: "class.manage", body: studentInput }, async ({ body, log }) => {
  const cls = await getClass();
  const bad = assertDobValid(body.dateOfBirth);
  if (bad) throw new HttpError(400, bad);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const code = body.studentCode ?? (await nextCodes(tx, 1))[0];
        const s = await tx.student.create({
          data: {
            classId: cls.id,
            studentCode: code,
            fullName: body.fullName,
            photoUrl: body.photoUrl,
            dateOfBirth: body.dateOfBirth ? parseDay(body.dateOfBirth) : null,
            phone: body.phone,
            parentPhone: body.parentPhone,
            ...(body.enrolledAt ? { enrolledAt: parseDay(body.enrolledAt) } : {}),
            notes: body.notes,
          },
        });
        await log({ action: "STUDENT_CREATE", category: "student", description: `O'quvchi qo'shildi: ${s.fullName} (${s.studentCode})`, entityType: "Student", entityId: s.id }, tx);
        return s;
      });
      return { student: serializeStudent(created) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        if (body.studentCode) throw new HttpError(409, `“${body.studentCode}” ID si band. Boshqa ID kiriting`);
        continue; // avtomatik ID poygasi — qayta urinish
      }
      throw e;
    }
  }
  throw new HttpError(409, "ID yaratib bo'lmadi, qayta urinib ko'ring");
});
