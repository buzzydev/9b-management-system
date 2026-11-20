import test from "node:test";
import assert from "node:assert/strict";
import { alphabeticalOrder, canReplace, dutyDaysBetween, effectiveCounts, isoWeekday, nextDutyDays, pickNext, progress, simulate, type DutyMemberLite } from "../src/lib/duty";

const mk = (n: number): DutyMemberLite[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `N${i}`, position: i, baseline: 0, enabled: true }));
const counts = (m: DutyMemberLite[]) => effectiveCounts(m, []);

test("har kuni 2 nafar, alifbo (navbat) tartibida", () => {
  const m = mk(6);
  const days = simulate(m, counts(m), 3);
  assert.deepEqual(days, [["s0", "s1"], ["s2", "s3"], ["s4", "s5"]]);
});

test("aylanish tugamaguncha hech kim takrorlanmaydi; toq sonda ham adolatli", () => {
  const m = mk(5);
  const days = simulate(m, counts(m), 5).flat();
  // 5 kishi, 10 ta o'rin => har kim aynan 2 marta
  for (const x of m) assert.equal(days.filter((d) => d === x.id).length, 2);
  // birinchi 5 ta o'rinda hamma bir martadan
  assert.equal(new Set(days.slice(0, 5)).size, 5);
  // bir kunda ikki xil o'quvchi
  const per = simulate(m, counts(m), 5);
  for (const d of per) assert.notEqual(d[0], d[1]);
});

test("aylanish chegarasidagi kun: oxirgi + yangi aylanishning birinchisi", () => {
  const m = mk(5);
  const d = simulate(m, counts(m), 3);
  assert.deepEqual(d[2], ["s4", "s0"]);
});

test("MISSED hisobga olinmaydi — o'quvchi keyingi kunga qoladi", () => {
  const m = mk(4);
  const c = effectiveCounts(m, [{ memberId: "s0", status: "MISSED" }, { memberId: "s1", status: "DONE" }]);
  assert.deepEqual(pickNext(m, c), ["s0", "s2"]);
});

test("yangi o'quvchi (baseline = joriy min) navbatsiz ketma-ket olmaydi", () => {
  const m = mk(4);
  const c = effectiveCounts(m, [{ memberId: "s0", status: "DONE" }, { memberId: "s1", status: "DONE" }]);
  const withNew = [...m, { id: "n", name: "Yangi", position: 0, baseline: 0, enabled: true }];
  const c2 = effectiveCounts(withNew, [{ memberId: "s0", status: "DONE" }, { memberId: "s1", status: "DONE" }]);
  assert.deepEqual(pickNext(withNew, c2), ["n", "s2"]); // baseline 0 = min, aylanishdan orqada emas
  assert.equal(c.get("s2"), 0);
});

test("o'chirilgan (enabled=false) o'quvchi tanlanmaydi", () => {
  const m = mk(3);
  m[0].enabled = false;
  assert.deepEqual(pickNext(m, counts(m)), ["s1", "s2"]);
});

test("progress: foiz va kutayotganlar", () => {
  const m = mk(4);
  const c = effectiveCounts(m, [{ memberId: "s0", status: "DONE" }, { memberId: "s1", status: "ASSIGNED" }]);
  const p = progress(m, c);
  assert.equal(p.percent, 50);
  assert.deepEqual(p.pendingIds, ["s2", "s3"]);
  assert.equal(p.completedRounds, 0);
  const full = effectiveCounts(m, m.map((x) => ({ memberId: x.id, status: "DONE" as const })));
  const pf = progress(m, full);
  assert.equal(pf.completedRounds, 1);
  assert.equal(pf.percent, 0);
});

test("qo'lda almashtirish: faqat hali navbat kelmaganlar bilan", () => {
  const m = mk(6);
  // s0,s1 bugun tayinlangan
  const c = effectiveCounts(m, [{ memberId: "s0", status: "ASSIGNED" }, { memberId: "s1", status: "ASSIGNED" }]);
  const busy = new Set(["s0", "s1"]);
  assert.equal(canReplace(m, c, { memberId: "s0", countsTowardRotation: true }, "s4", busy).ok, true);
  assert.equal(canReplace(m, c, { memberId: "s0", countsTowardRotation: true }, "s1", busy).ok, false); // band
  // s1 bajargan (hisob 1), s0 bugun; s1 ni s0 o'rniga qo'yish adolatsiz: boshqalar hali bajarmagan
  const c2 = effectiveCounts(m, [{ memberId: "s1", status: "DONE" }, { memberId: "s0", status: "ASSIGNED" }]);
  assert.equal(canReplace(m, c2, { memberId: "s0", countsTowardRotation: true }, "s1", new Set(["s0"])).ok, false);
});

test("almashtirishdan keyin hisob to'g'ri: asl o'quvchi navbati qaytadi", () => {
  const m = mk(5);
  // bugun s0,s1; s1 o'rniga s4 qo'yildi
  const after = effectiveCounts(m, [{ memberId: "s0", status: "ASSIGNED" }, { memberId: "s4", status: "ASSIGNED" }]);
  assert.deepEqual(pickNext(m, after), ["s1", "s2"]);
});

test("hafta kunlari va to'ldirish (backfill)", () => {
  assert.equal(isoWeekday("2026-11-22"), 7); // yakshanba
  assert.equal(isoWeekday("2026-11-19"), 4);
  assert.deepEqual(nextDutyDays("2026-11-21", [1, 2, 3, 4, 5, 6], 3), ["2026-11-21", "2026-11-23", "2026-11-24"]);
  assert.deepEqual(dutyDaysBetween("2026-11-19", "2026-11-23", [1, 2, 3, 4, 5, 6]), ["2026-11-20", "2026-11-21", "2026-11-23"]);
  assert.equal(dutyDaysBetween("2026-01-01", "2026-11-23", [1, 2, 3, 4, 5, 6], 10).length, 10);
});

test("alifbo tartibi", () => {
  const ids = alphabeticalOrder([{ id: "1", name: "Zafar" }, { id: "2", name: "Aziz" }, { id: "3", name: "Madina" }]);
  assert.deepEqual(ids, ["2", "3", "1"]);
});
