import test from "node:test";
import assert from "node:assert/strict";
import { currentAndNext, findConflict, timeToMin, type Slot } from "../src/lib/timetable";

const L = (n: number, st: string, en: string, wd = 1, id?: string): Slot => ({ id, weekday: wd, lessonNumber: n, startTime: st, endTime: en });
const day = [L(1, "08:00", "08:45"), L(2, "08:55", "09:40")];

test("vaqtni daqiqaga aylantirish", () => assert.equal(timeToMin("08:30"), 510));

test("to'qnashuvlar", () => {
  assert.ok(findConflict(day, L(1, "10:00", "10:45")), "bir xil dars raqami");
  assert.ok(findConflict(day, L(3, "09:30", "10:15")), "vaqt kesishadi");
  assert.equal(findConflict(day, L(3, "09:40", "10:25")), null, "chegarada tegib turish ruxsat");
  assert.equal(findConflict(day, L(1, "08:00", "08:45", 2)), null, "boshqa kun");
  assert.ok(findConflict(day, L(3, "10:00", "09:00")), "tugash boshlanishdan oldin");
  assert.ok(findConflict(day, L(3, "25:00", "26:00")), "noto'g'ri format");
});

test("tahrirlashda o'zi bilan to'qnashmaydi", () => {
  const ex = [L(1, "08:00", "08:45", 1, "a")];
  assert.equal(findConflict(ex, L(1, "08:00", "08:50", 1, "a")), null);
});

test("hozirgi va keyingi dars", () => {
  assert.equal(currentAndNext(day, 7 * 60).current, null);
  assert.equal(currentAndNext(day, 7 * 60).next?.lessonNumber, 1);
  assert.equal(currentAndNext(day, 8 * 60 + 10).current?.lessonNumber, 1);
  assert.equal(currentAndNext(day, 8 * 60 + 10).next?.lessonNumber, 2);
  assert.equal(currentAndNext(day, 8 * 60 + 50).current, null);
  assert.equal(currentAndNext(day, 9 * 60 + 40).next, null);
});
