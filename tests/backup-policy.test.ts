import test from "node:test";
import assert from "node:assert/strict";
import {
  backupFileName, canDeleteManually, dbIdentity, isSameDatabase, localDay, localToUtc, nextDailyRun, planRetention, redact, utcCronFor,
  type RetentionRow,
} from "../src/lib/services/backup-policy";

const TZ = "Asia/Tashkent";
const D = (iso: string) => new Date(iso);
const daily = (n: number, today = "2026-11-21"): RetentionRow => {
  const day = new Date(new Date(`${today}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);
  return { id: `d${n}`, kind: "DAILY", status: "SUCCESS", verified: true, runDate: day, createdAt: localToUtc(day, 3, 0, TZ) };
};

test("Cron: 03:00 Asia/Tashkent = 22:00 UTC", () => {
  assert.equal(utcCronFor(TZ), "0 22 * * *");
  assert.equal(utcCronFor("UTC"), "0 3 * * *");
});

test("DST'li mintaqa uchun UTC cron rad etiladi", () => {
  assert.throws(() => utcCronFor("Europe/London"));
});

test("keyingi zaxira: 03:00 dan oldin — bugun, keyin — ertaga", () => {
  // 2026-11-21 01:00 Toshkent = 2026-11-20 20:00Z
  assert.equal(nextDailyRun(D("2026-11-20T20:00:00Z"), TZ).toISOString(), "2026-11-20T22:00:00.000Z");
  // 2026-11-21 03:00:01 Toshkent
  assert.equal(nextDailyRun(D("2026-11-20T22:00:01Z"), TZ).toISOString(), "2026-11-21T22:00:00.000Z");
  // aynan 03:00 — kelgusi (ertangi) ni qaytaradi
  assert.equal(nextDailyRun(D("2026-11-20T22:00:00Z"), TZ).toISOString(), "2026-11-21T22:00:00.000Z");
});

test("kun chegarasi Toshkent vaqti bo'yicha", () => {
  assert.equal(localDay(D("2026-11-20T22:00:00Z"), TZ), "2026-11-21");
  assert.equal(localDay(D("2026-11-20T18:59:00Z"), TZ), "2026-11-20");
  assert.equal(localToUtc("2026-11-21", 3, 0, TZ).toISOString(), "2026-11-20T22:00:00.000Z");
});

test("saqlash: 10 ta kunlik zaxiradan eng yangi 7 tasi qoladi, bugungisi o'chmaydi", () => {
  const rows = Array.from({ length: 10 }, (_, i) => daily(i));
  const plan = planRetention(rows, D("2026-11-21T05:00:00Z"));
  assert.deepEqual(plan.deleteIds.sort(), ["d7", "d8", "d9"]);
  assert.ok(plan.keepIds.includes("d0"));
  assert.equal(plan.keepIds.length, 7);
});

test("saqlash: 7 yoki undan kam bo'lsa hech narsa o'chirilmaydi", () => {
  const rows = Array.from({ length: 7 }, (_, i) => daily(i));
  assert.deepEqual(planRetention(rows, D("2026-11-21T05:00:00Z")).deleteIds, []);
});

test("saqlash: yagona yaroqli zaxira eskirgan bo'lsa ham o'chirilmaydi", () => {
  const old: RetentionRow = { id: "m1", kind: "MANUAL", status: "SUCCESS", verified: true, runDate: null, createdAt: D("2026-01-01T00:00:00Z") };
  const plan = planRetention([old], D("2026-11-21T05:00:00Z"));
  assert.deepEqual(plan.deleteIds, []);
});

test("saqlash: yangi yaroqli zaxira bor bo'lsa, 7 kundan eski qo'lda zaxira o'chiriladi", () => {
  const old: RetentionRow = { id: "m1", kind: "MANUAL", status: "SUCCESS", verified: true, runDate: null, createdAt: D("2026-11-01T00:00:00Z") };
  const fresh: RetentionRow = { id: "m2", kind: "PRE_RESTORE", status: "SUCCESS", verified: true, runDate: null, createdAt: D("2026-11-20T00:00:00Z") };
  const plan = planRetention([old, fresh, daily(0)], D("2026-11-21T05:00:00Z"));
  assert.deepEqual(plan.deleteIds, ["m1"]);
});

test("saqlash: xato va to'xtab qolgan yozuvlar tozalanadi, yangilari tegilmaydi", () => {
  const now = D("2026-11-21T05:00:00Z");
  const rows: RetentionRow[] = [
    daily(0),
    { id: "f-old", kind: "DAILY", status: "FAILED", verified: false, runDate: null, createdAt: D("2026-11-01T00:00:00Z") },
    { id: "f-new", kind: "DAILY", status: "FAILED", verified: false, runDate: null, createdAt: D("2026-11-20T00:00:00Z") },
    { id: "p-stale", kind: "MANUAL", status: "PENDING", verified: false, runDate: null, createdAt: D("2026-11-21T03:00:00Z") },
    { id: "p-live", kind: "MANUAL", status: "VERIFYING", verified: false, runDate: null, createdAt: D("2026-11-21T04:50:00Z") },
  ];
  assert.deepEqual(planRetention(rows, now).deleteIds.sort(), ["f-old", "p-stale"]);
});

test("qo'lda o'chirish: yagona yaroqli va bugungi kunlik himoyalangan", () => {
  const one = daily(0);
  assert.equal(canDeleteManually(one, [one], "2026-11-21").ok, false);
  const two = [daily(0), daily(1)];
  assert.equal(canDeleteManually(two[0], two, "2026-11-21").ok, false); // bugungi
  assert.equal(canDeleteManually(two[1], two, "2026-11-21").ok, true);
});

test("zaxira bazasi asosiy bazadan farq qilishi shart", () => {
  const primary = "postgresql://u:p@ep-cool-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
  const direct = "postgresql://u:p@ep-cool-123.eu-central-1.aws.neon.tech/neondb";
  const other = "postgresql://u:p@ep-other-456.eu-central-1.aws.neon.tech/neondb";
  assert.equal(isSameDatabase(primary, direct), true); // pooled va direct — bitta baza
  assert.equal(isSameDatabase(primary, other), false);
  assert.equal(isSameDatabase(undefined, primary), false);
  assert.equal(dbIdentity("not a url"), null);
});

test("xato matnidan ulanish paroli olib tashlanadi", () => {
  const m = redact("connect failed postgresql://user:secret@host/db?sslmode=require timeout");
  assert.ok(!m.includes("secret"));
  assert.ok(m.includes("postgresql://***"));
});

test("fayl nomi", () => {
  assert.match(backupFileName("DAILY", D("2026-11-20T22:00:05Z"), "nb_abcdef123456"), /^ninebee-daily-20261120220005-123456\.json\.gz$/);
  assert.match(backupFileName("PRE_RESTORE", D("2026-11-20T22:00:05Z"), "nb_abcdef123456"), /^ninebee-pre-restore-/);
});
