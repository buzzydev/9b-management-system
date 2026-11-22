import test from "node:test";
import assert from "node:assert/strict";
import { attendanceRate, average, emptyCounts, percent, tally } from "../src/lib/stats";

test("davomat foizi: keldi+kechikdi / (keldi+kechikdi+kelmadi); sababli maxrajga kirmaydi", () => {
  assert.equal(attendanceRate({ PRESENT: 8, LATE: 1, ABSENT: 1, EXCUSED: 5 }), 90);
  assert.equal(attendanceRate({ PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 3 }), null);
  assert.equal(attendanceRate({ PRESENT: 0, LATE: 0, ABSENT: 4, EXCUSED: 0 }), 0);
  assert.equal(attendanceRate({ PRESENT: 2, LATE: 0, ABSENT: 1, EXCUSED: 0 }), 66.7);
});

test("tally holatlarni sanaydi", () => {
  const c = tally([{ status: "PRESENT" }, { status: "PRESENT" }, { status: "ABSENT" }, { status: "LATE" }]);
  assert.deepEqual(c, { ...emptyCounts(), PRESENT: 2, ABSENT: 1, LATE: 1 });
});

test("o'rtacha va foiz", () => {
  assert.equal(average([]), null);
  assert.equal(average([5, 4, 4]), 4.33);
  assert.equal(percent(1, 0), 0);
  assert.equal(percent(1, 3), 33.3);
});


