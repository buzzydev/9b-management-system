import test from "node:test";
import assert from "node:assert/strict";
import { checkQrSession, generateQrToken, hashToken } from "../src/lib/qr";

const base = { closedAt: null, expiresAt: new Date("2026-11-18T05:10:00Z"), lateAfter: new Date("2026-11-18T05:05:00Z"), date: new Date("2026-11-18T00:00:00Z") };
const day = "2026-11-18";

test("token noyob va hash deterministik", () => {
  const a = generateQrToken(), b = generateQrToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 43);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), a);
  assert.match(hashToken(a), /^[a-f0-9]{64}$/);
});

test("QR sessiya: vaqtida, kechikkan, muddati o'tgan, yopilgan, boshqa kun", () => {
  assert.deepEqual(checkQrSession(base, new Date("2026-11-18T05:01:00Z"), day), { ok: true, late: false });
  assert.deepEqual(checkQrSession(base, new Date("2026-11-18T05:07:00Z"), day), { ok: true, late: true });
  assert.deepEqual(checkQrSession(base, new Date("2026-11-18T05:10:00Z"), day), { ok: false, reason: "expired" });
  assert.deepEqual(checkQrSession({ ...base, closedAt: new Date() }, new Date("2026-11-18T05:01:00Z"), day), { ok: false, reason: "closed" });
  assert.deepEqual(checkQrSession(base, new Date("2026-11-18T05:01:00Z"), "2026-11-19"), { ok: false, reason: "wrong_day" });
});
