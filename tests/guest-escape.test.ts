import test from "node:test";
import assert from "node:assert/strict";
import { can } from "../src/lib/permissions";
import { isStaffOnlyPath, isPublicPath } from "../src/lib/session-constants";
import { attendanceRate, emptyCounts, tally } from "../src/lib/stats";

test("mehmon hech qanday imkoniyatga ega emas (admin huquqi berilmaydi)", () => {
  for (const cap of ["class.manage", "users.manage", "system.manage", "backup.manage", "students.purge", "logs.all"] as const) {
    assert.equal(can("GUEST", cap), false, cap);
  }
});

test("«Qochib ketdi»ni barcha xodimlar belgilay oladi", () => {
  // «Qochib ketdi»ni barcha xodimlar belgilay oladi (class.manage); mehmon esa hech narsa qila olmaydi
  for (const r of ["ADMIN", "TEACHER", "CLASS_LEADER", "ASSISTANT"] as const) assert.equal(can(r, "class.manage"), true, r);
});

test("xodimlar uchun yopiq sahifalar", () => {
  for (const p of ["/reports", "/messages", "/logs", "/settings", "/profile", "/admin/users", "/escapes", "/notifications", "/students/abc123"]) {
    assert.equal(isStaffOnlyPath(p), true, p);
  }
  for (const p of ["/dashboard", "/students", "/duty", "/timetable", "/calendar", "/announcements"]) {
    assert.equal(isStaffOnlyPath(p), false, p);
  }
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/admin/users"), false);
});

test("«Qochib ketdi» davomat foizini «Kelmadi» kabi tushiradi", () => {
  const c = { ...emptyCounts(), PRESENT: 8, ESCAPED: 2 };
  assert.equal(attendanceRate(c), 80);
  assert.equal(attendanceRate({ ...emptyCounts(), ESCAPED: 1 }), 0);
  assert.equal(tally([{ status: "ESCAPED" }, { status: "PRESENT" }]).ESCAPED, 1);
});
