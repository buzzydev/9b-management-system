#!/usr/bin/env node
/**
 * Ishga tushirish oldidan (Railway `npm start` ichida) bir marta ishlaydi. Idempotent:
 *  1. Migratsiyalarni qo'llaydi (prisma/migrations bo'lsa `migrate deploy`, bo'lmasa `db push`)
 *  2. ActivityLog uchun append-only trigger o'rnatadi (UPDATE/DELETE bloklanadi)
 *  3. Tizim sozlamalari, sinf va (bo'sh bo'lsa) standart fanlarni yaratadi
 *  4. ADMIN yo'q bo'lsa, ADMIN_USERNAME / ADMIN_PASSWORD bilan birinchi adminni yaratadi
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const log = (msg, extra = {}) => console.log(JSON.stringify({ level: "info", scope: "bootstrap", msg, ...extra }));
const warn = (msg, extra = {}) => console.warn(JSON.stringify({ level: "warn", scope: "bootstrap", msg, ...extra }));

function run(args) {
  const res = spawnSync("npx", ["prisma", ...args], { stdio: "inherit", env: process.env.DIRECT_URL ? { ...process.env, DATABASE_URL: process.env.DIRECT_URL } : process.env, shell: process.platform === "win32" });
  if (res.status !== 0) throw new Error(`prisma ${args.join(" ")} xatolik bilan tugadi (kod ${res.status})`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL o'rnatilmagan");

  // 1) Sxema
  const hasMigrations = existsSync("prisma/migrations") && readdirSync("prisma/migrations").some((f) => !f.startsWith(".") && f !== "migration_lock.toml");
  if (hasMigrations) {
    log("migrate deploy");
    run(["migrate", "deploy"]);
  } else {
    warn("prisma/migrations topilmadi — `db push` ishlatilmoqda. Ishlab chiqarish uchun `npm run db:init-migration` bilan migratsiya yarating va git'ga qo'shing.");
    run(["db", "push", "--skip-generate"]);
  }

  const prisma = new PrismaClient();
  try {
    // 2) Append-only jurnal trigger'i
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION activitylog_block_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'ActivityLog faqat qo''shiladi (append-only): % bloklandi', TG_OP;
      END;
      $$ LANGUAGE plpgsql;`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS activitylog_no_update ON "ActivityLog";`);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER activitylog_no_update BEFORE UPDATE OR DELETE ON "ActivityLog" FOR EACH ROW EXECUTE FUNCTION activitylog_block_mutation();`,
    );
    log("append-only trigger o'rnatildi");

    // 3) Tizim ma'lumotlari
    await prisma.systemSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton", schoolName: process.env.SCHOOL_NAME || "9-B Maktab" },
    });

    const className = process.env.CLASS_NAME || "9-B";
    await prisma.class.upsert({ where: { name: className }, update: {}, create: { name: className } });

    if ((await prisma.subject.count()) === 0) {
      const subjects = [
        ["Ona tili", "Ona t."], ["Adabiyot", "Adab."], ["Algebra", "Alg."], ["Geometriya", "Geom."], ["Ingliz tili", "Ing."],
        ["Rus tili", "Rus t."], ["Tarix", "Tarix"], ["Geografiya", "Geogr."], ["Fizika", "Fiz."], ["Kimyo", "Kim."],
        ["Biologiya", "Bio."], ["Informatika", "Inf."], ["Jismoniy tarbiya", "JT"],
      ];
      await prisma.subject.createMany({ data: subjects.map(([name, shortName]) => ({ name, shortName })), skipDuplicates: true });
      log("standart fanlar yaratildi (Admin → Tizim boshqaruvi orqali tahrirlash mumkin)");
    }

    // 4) Birinchi admin
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins === 0) {
      const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
      const password = process.env.ADMIN_PASSWORD || "";
      if (password.length < 10) {
        warn("ADMIN yo'q, lekin ADMIN_PASSWORD o'rnatilmagan yoki 10 belgidan qisqa — admin yaratilmadi. Muhit o'zgaruvchisini o'rnatib qayta ishga tushiring.");
      } else {
        const user = await prisma.user.create({
          data: {
            username,
            fullName: process.env.ADMIN_FULL_NAME || "Administrator",
            role: "ADMIN",
            passwordHash: await bcrypt.hash(password, 12),
            settings: { create: {} },
          },
        });
        await prisma.activityLog.create({
          data: { userId: user.id, userName: user.fullName, role: "ADMIN", action: "USER_CREATE", category: "user", description: "Birinchi administrator yaratildi (bootstrap)", entityType: "User", entityId: user.id },
        });
        log("birinchi admin yaratildi", { username });
      }
    } else {
      log("admin mavjud — o'tkazib yuborildi");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ level: "error", scope: "bootstrap", msg: String(e?.message ?? e) }));
  process.exit(1);
});
