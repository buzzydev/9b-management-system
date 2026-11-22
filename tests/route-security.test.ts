// Statik xavfsizlik auditi: barcha API route fayllarini o'qib, qoidalarga mosligini tekshiradi (deps kerak emas).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "src", "app", "api");
const files: string[] = [];
(function walk(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "route.ts") files.push(p);
  }
})(root);
const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");
const src = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

// Handlerning bevosita route()/publicRoute() bilan o'ralganligi
const exportsOf = (s: string) => [...s.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*(\w+)\s*\(/g)].map((m) => ({ method: m[1], wrapper: m[2] }));

test("har bir HTTP handler route() yoki publicRoute() orqali yozilgan", () => {
  const bad: string[] = [];
  for (const [f, s] of src) {
    const fnStyle = [...s.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)];
    // Ataylab oddiy funksiya: logout (sessiyasiz ham xavfsiz, idempotent) va files (ichida getSession() tekshiruvi bor)
    if (fnStyle.length && !["health/route.ts", "auth/logout/route.ts", "files/[name]/route.ts"].includes(rel(f))) bad.push(`${rel(f)}: oddiy function handler`);
    for (const e of exportsOf(s)) if (!["route", "publicRoute"].includes(e.wrapper)) bad.push(`${rel(f)} ${e.method}: ${e.wrapper}`);
  }
  assert.deepEqual(bad, []);
});

test("publicRoute faqat ruxsat etilgan ochiq endpointlarda", () => {
  const allowed = new Set(["auth/login/route.ts", "scan/route.ts"]);
  const used = [...src].filter(([, s]) => /publicRoute\s*\(/.test(s)).map(([f]) => rel(f));
  for (const u of used) assert.ok(allowed.has(u), `kutilmagan ochiq endpoint: ${u}`);
});

test("mehmon (guest: true) faqat GET route'larda; yozuvchi metodlarda yo'q", () => {
  const bad: string[] = [];
  for (const [f, s] of src) {
    for (const m of s.matchAll(/export const (POST|PUT|PATCH|DELETE)\s*=\s*route\s*\(\s*\{([^}]*)\}/g)) {
      if (/guest\s*:\s*true/.test(m[2])) bad.push(`${rel(f)} ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("admin endpointlar (users, backups, settings/system) ruxsat (cap/roles) talab qiladi", () => {
  const bad: string[] = [];
  for (const [f, s] of src) {
    const r = rel(f);
    if (!/^(users|backups|settings\/system)\//.test(r) && !/^(users|backups)\/route\.ts$/.test(r)) continue;
    if (r === "settings/system/route.ts") continue; // GET ataylab class.manage (maktab nomi o'qiladi); PATCH quyida alohida tekshiriladi
    for (const m of s.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*route\s*\(\s*\{([^}]*)\}/g)) {
      if (!/cap\s*:\s*"(users|system|backup)\.manage"/.test(m[2]) && !/roles\s*:/.test(m[2])) bad.push(`${r} ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("mehmon uchun ochiq route'lar passwordHash yoki maxfiy maydon qaytarmaydi", () => {
  for (const [f, s] of src) {
    if (/guest\s*:\s*true/.test(s)) assert.ok(!/passwordHash/.test(s), `${rel(f)}: passwordHash`);
  }
});

test("hech bir route passwordHash'ni javobga qo'shmaydi (select/omit'siz)", () => {
  const bad: string[] = [];
  for (const [f, s] of src) {
    if (/passwordHash\s*:\s*true/.test(s)) bad.push(rel(f));
  }
  assert.deepEqual(bad, []);
});

test("settings/system PATCH faqat system.manage talab qiladi", () => {
  const s = src.get(path.join(root, "settings", "system", "route.ts"))!;
  assert.match(s, /export const PATCH = route\(\{ cap: "system\.manage"/);
});

test("yozuvchi route'lar jurnalga yozadi (log) yoki servisga topshiradi", () => {
  const skip = /^(auth\/|scan\/|me\/|notifications\/|messages\/|search\/|announcements\/\[id\]\/read|backups\/\[id\]|upload|settings\/user)/; // settings/user — foydalanuvchining shaxsiy sozlamalari (faqat o'z qatori)
  const bad: string[] = [];
  for (const [f, s] of src) {
    if (skip.test(rel(f))) continue;
    for (const m of s.matchAll(/export const (POST|PUT|PATCH|DELETE)\s*=/g)) {
      if (!/log\s*\(|logActivity|log\b/.test(s)) bad.push(`${rel(f)} ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("middleware ochiq yo'llari: login/scan/health dan boshqa API ochiq emas", async () => {
  const { PUBLIC_PATHS, isStaffOnlyPath } = await import("../src/lib/session-constants");
  assert.deepEqual([...PUBLIC_PATHS].sort(), ["/api/auth/login", "/api/health", "/api/scan", "/login", "/scan"].sort());
  for (const p of ["/admin/backup", "/reports", "/messages", "/logs", "/settings", "/students/abc"]) assert.ok(isStaffOnlyPath(p), p);
});
