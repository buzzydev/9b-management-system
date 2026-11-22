#!/usr/bin/env node
/**
 * Ekran o'lchamlari bo'yicha avtomatik tekshiruv (ishlayotgan ilovaga qarshi):
 *   npm i --no-save playwright && npx playwright install chromium
 *   BASE_URL=http://localhost:3000 CHECK_USER=admin CHECK_PASS=... node scripts/responsive-check.mjs
 * Har bir sahifa × o'lcham uchun: gorizontal siljish bormi, rasmlar yuklandimi — va skrinshot (responsive-report/).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SIZES = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const PAGES = ["/login", "/dashboard", "/attendance", "/students", "/duty", "/timetable", "/calendar", "/announcements", "/escapes", "/reports", "/messages", "/notifications", "/logs", "/settings", "/profile", "/admin/users", "/admin/system", "/admin/backup"];
mkdirSync("responsive-report", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
if (process.env.CHECK_USER) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[autocomplete="username"]', process.env.CHECK_USER);
  await page.fill('input[autocomplete="current-password"]', process.env.CHECK_PASS || "");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }), page.click('button[type="submit"]')]);
}

let problems = 0;
for (const path of PAGES) {
  for (const w of SIZES) {
    await page.setViewportSize({ width: w, height: w < 768 ? 800 : 900 });
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => null);
    await page.waitForTimeout(700); // animatsiyalar tugashi uchun
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
    }));
    const bad = r.overflow > 1 || r.brokenImgs.length > 0 || (res && res.status() >= 400);
    if (bad) problems++;
    console.log(`${bad ? "✘" : "✔"} ${path} @${w}px${r.overflow > 1 ? ` gorizontal siljish +${r.overflow}px` : ""}${r.brokenImgs.length ? ` buzuq rasm: ${r.brokenImgs.join(",")}` : ""}${res && res.status() >= 400 ? ` HTTP ${res.status()}` : ""}`);
    if (bad || [375, 1280].includes(w)) await page.screenshot({ path: `responsive-report/${path.replace(/\//g, "_") || "_"}-${w}.png`, fullPage: true });
  }
}
await browser.close();
console.log(problems ? `\n${problems} ta muammo — skrinshotlar responsive-report/ da` : "\nHammasi o'tdi");
process.exit(problems ? 1 : 0);
