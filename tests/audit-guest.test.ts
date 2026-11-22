import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { GUEST_AUDIT_NAME, auditActor, normalizeAuditUser } from "../src/lib/audit-actor";
import { can, type Capability } from "../src/lib/permissions";

const src = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
const base = { id: "u1", fullName: "Ali Valiyev" };

test("mehmon audit jurnaliga foydalanuvchi sifatida yozilmaydi", () => {
  const a = auditActor({ id: "guest", fullName: "Mehmon", role: "GUEST" });
  assert.equal(a.user, null);
  assert.equal(a.userName, GUEST_AUDIT_NAME);
});

test("haqiqiy rollar to'g'ri uzatiladi", () => {
  for (const role of ["ADMIN", "TEACHER", "CLASS_LEADER", "ASSISTANT"] as const) {
    assert.deepEqual(auditActor({ ...base, role }), { user: { id: "u1", fullName: "Ali Valiyev", role } });
  }
});

test("sessiyadagi ortiqcha maydonlar (email, telefon, parol) jurnalga o'tmaydi", () => {
  const session = { ...base, role: "TEACHER" as const, email: "a@b.c", phone: "+998", passwordHash: "x" };
  assert.deepEqual(Object.keys(auditActor(session).user!).sort(), ["fullName", "id", "role"]);
});

test("sessiya yo'q bo'lsa — foydalanuvchi yo'q", () => {
  assert.deepEqual(auditActor(null), { user: null });
  assert.deepEqual(auditActor(undefined), { user: null });
});

test("normalizeAuditUser: tip tizimi chetlab o'tilsa ham mehmon va soxta 'guest' id rad etiladi", () => {
  assert.equal(normalizeAuditUser({ id: "guest", fullName: "Mehmon", role: "GUEST" }), null);
  assert.equal(normalizeAuditUser({ id: "guest", fullName: "X", role: "ADMIN" }), null);
  assert.equal(normalizeAuditUser({ id: "u1", fullName: "X", role: "GUEST" }), null);
  assert.equal(normalizeAuditUser(null), null);
  assert.deepEqual(normalizeAuditUser({ id: "u1", fullName: "X", role: "ADMIN" }), { id: "u1", fullName: "X", role: "ADMIN" });
});

test("mehmon hech qanday huquqqa ega emas (can() doim false)", () => {
  const caps = [...src("src/lib/permissions.ts").matchAll(/"([a-z]+\.[a-z.]+)"/g)].map((m) => m[1] as Capability);
  assert.ok(caps.length > 10);
  for (const c of new Set(caps)) assert.equal(can("GUEST", c), false, c);
});

test("hech bir joyda sessiya logActivity'ga to'g'ridan-to'g'ri `user: session` bo'lib uzatilmaydi", () => {
  const bad: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && /user:\s*session\b/.test(fs.readFileSync(p, "utf8")) && /logActivity|log\(/.test(fs.readFileSync(p, "utf8"))) bad.push(p);
    }
  };
  walk(path.resolve(__dirname, "..", "src"));
  assert.deepEqual(bad, []);
});

test("api.ts va logout jurnalni auditActor() orqali yozadi; logActivity normalizeAuditUser ishlatadi", () => {
  assert.match(src("src/lib/api.ts"), /\.\.\.auditActor\(current\)/);
  assert.match(src("src/app/api/auth/logout/route.ts"), /\.\.\.auditActor\(session\)/);
  assert.match(src("src/lib/audit.ts"), /normalizeAuditUser\(p\.user\)/);
  assert.match(src("src/lib/services/backup.ts"), /\.\.\.auditActor\(actor\)/);
});

test("type-guard (`x is T`) funksiyalar yo'q — string qiymatda `never`ga torayish xatosini oldini oladi", () => {
  const bad: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && /\):\s*\w+\s+is\s+\w+/.test(fs.readFileSync(p, "utf8"))) bad.push(p);
    }
  };
  walk(path.resolve(__dirname, "..", "src"));
  assert.deepEqual(bad, []);
});
