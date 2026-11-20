import test from "node:test";
import assert from "node:assert/strict";
import { can, CLASS_LOG_CATEGORIES } from "../src/lib/permissions";
import { addDaysStr, isDayString, monthRange, previousMonth, startOfWeek, todayStr, fmtDay } from "../src/lib/dates";

test("rollar: barcha rollar sinfni boshqaradi, admin-only imkoniyatlar faqat adminda", () => {
  for (const r of ["ADMIN", "TEACHER", "CLASS_LEADER", "ASSISTANT"] as const) assert.equal(can(r, "class.manage"), true);
  for (const cap of ["users.manage", "system.manage", "backup.manage", "students.purge", "logs.all"] as const) {
    assert.equal(can("ADMIN", cap), true);
    for (const r of ["TEACHER", "CLASS_LEADER", "ASSISTANT"] as const) assert.equal(can(r, cap), false, `${r} ${cap}`);
  }
});

test("oddiy rollar uchun auth/user/settings/backup jurnallari yashirin", () => {
  for (const hidden of ["auth", "user", "settings", "backup"]) assert.ok(!(CLASS_LOG_CATEGORIES as readonly string[]).includes(hidden));
});

test("sana yordamchilari", () => {
  assert.equal(isDayString("2026-02-29"), false);
  assert.equal(isDayString("2026-11-18"), true);
  assert.equal(addDaysStr("2026-12-31", 1), "2027-01-01");
  assert.equal(previousMonth("2026-01"), "2025-12");
  assert.equal(monthRange("2026-02").to.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(fmtDay(startOfWeek(new Date("2026-11-18T00:00:00Z"))), "2026-11-16");
});

test("Toshkent vaqti bo'yicha 'bugun' (UTC+5)", () => {
  assert.equal(todayStr(new Date("2026-11-18T20:30:00Z"), "Asia/Tashkent"), "2026-11-19");
  assert.equal(todayStr(new Date("2026-11-18T18:59:00Z"), "Asia/Tashkent"), "2026-11-18");
});
