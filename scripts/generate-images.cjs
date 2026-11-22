#!/usr/bin/env node
/**
 * public/images/* ni qayta yaratadi (original vektor illyustratsiyalar → WebP/PNG).
 * Ishlatish: `node scripts/generate-images.cjs`  (sharp paketi kerak: Next.js bilan birga o'rnatiladi yoki `npm i -D sharp`)
 * Rasmlar loyihada tayyor holda bor — bu skript faqat o'zgartirmoqchi bo'lsangiz kerak.
 */
let sharp;
try { sharp = require("sharp"); } catch { sharp = require("/opt/npm-tools/node_modules/sharp"); }
const path = require("path");
const out = path.join(__dirname, "..", "public", "images");

const defs = `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06111F"/><stop offset=".55" stop-color="#0B2E47"/><stop offset="1" stop-color="#166E7A"/></linearGradient>
  <radialGradient id="glowC" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#22D3EE" stop-opacity=".55"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowT" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2DD4BF" stop-opacity=".40"/><stop offset="1" stop-color="#2DD4BF" stop-opacity="0"/></radialGradient>
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#143B5A"/><stop offset="1" stop-color="#0A2238"/></linearGradient>
  <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E6F8C"/><stop offset="1" stop-color="#145066"/></linearGradient>
  <linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6FBFF"/><stop offset="1" stop-color="#7DE8F9"/></linearGradient>
  <linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".20"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".07"/></linearGradient>
  <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22D3EE"/><stop offset="1" stop-color="#5EEAD4"/></linearGradient>
  <pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#fff" fill-opacity=".10"/></pattern>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity=".35"/></filter>
</defs>`;

function building(cx, baseY, s = 1) {
  const W = 620 * s, H = 250 * s, x0 = cx - W / 2, y0 = baseY - H;
  let cols = "";
  for (let i = 0; i < 6; i++) cols += `<rect x="${cx - 150 * s + i * 60 * s}" y="${y0 + 12 * s}" width="${22 * s}" height="${H - 36 * s}" rx="${4 * s}" fill="#0E3552" stroke="#7DE8F9" stroke-opacity=".35"/>`;
  let wins = "";
  for (const side of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const wx = side < 0 ? x0 + 28 * s + c * 70 * s : x0 + W - 28 * s - 44 * s - c * 70 * s;
    wins += `<rect x="${wx}" y="${y0 + 40 * s + r * 84 * s}" width="${44 * s}" height="${58 * s}" rx="${8 * s}" fill="url(#win)" opacity="${r === 1 && c === 1 ? 0.45 : 0.92}"/>`;
  }
  return `
  <ellipse cx="${cx}" cy="${baseY + 14 * s}" rx="${W * 0.62}" ry="${28 * s}" fill="#000" opacity=".28"/>
  <rect x="${x0 - 20 * s}" y="${baseY - 14 * s}" width="${W + 40 * s}" height="${14 * s}" rx="${6 * s}" fill="#0A2238" stroke="#7DE8F9" stroke-opacity=".25"/>
  <rect x="${x0}" y="${y0}" width="${W}" height="${H - 14 * s}" rx="${14 * s}" fill="url(#wall)" stroke="#7DE8F9" stroke-opacity=".30"/>
  <polygon points="${cx - 210 * s},${y0} ${cx},${y0 - 120 * s} ${cx + 210 * s},${y0}" fill="url(#roof)" stroke="#7DE8F9" stroke-opacity=".5"/>
  <circle cx="${cx}" cy="${y0 - 52 * s}" r="${22 * s}" fill="url(#win)"/><circle cx="${cx}" cy="${y0 - 52 * s}" r="${22 * s}" fill="none" stroke="#0A2238" stroke-width="${3 * s}"/>
  <path d="M${cx} ${y0 - 52 * s} V${y0 - 66 * s} M${cx} ${y0 - 52 * s} L${cx + 10 * s} ${y0 - 46 * s}" stroke="#0A2238" stroke-width="${3 * s}" stroke-linecap="round"/>
  <line x1="${cx}" y1="${y0 - 120 * s}" x2="${cx}" y2="${y0 - 178 * s}" stroke="#B0F2FF" stroke-width="${3 * s}"/>
  <path d="M${cx} ${y0 - 178 * s} h${52 * s} l${-12 * s} ${14 * s} l${12 * s} ${14 * s} h${-52 * s} z" fill="#F5B84B"/>
  ${cols}${wins}
  <path d="M${cx - 34 * s} ${baseY - 14 * s} v${-86 * s} a${34 * s} ${34 * s} 0 0 1 ${68 * s} 0 v${86 * s} z" fill="#06111F" stroke="#7DE8F9" stroke-opacity=".5"/>
  <path d="M${cx - 34 * s} ${baseY - 14 * s} v${-86 * s} a${34 * s} ${34 * s} 0 0 1 ${34 * s} ${-34 * s} v${120 * s} z" fill="#7DE8F9" opacity=".18"/>`;
}

function ring(cx, cy, r, pct) {
  const c = 2 * Math.PI * r;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="14"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#accent)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 ${cx} ${cy})"/>`;
}

function floatCards(x, y, s = 1) {
  const cx0 = x + 150 * s, cy0 = y + 230 * s, base = cy0 + 160 * s;
  const bars = [0.45, 0.7, 0.55, 0.95, 0.65, 0.8].map((v, i) => `<rect x="${cx0 + 28 * s + i * 40 * s}" y="${base - v * 120 * s}" width="${24 * s}" height="${v * 120 * s}" rx="${7 * s}" fill="${i === 3 ? "#F5B84B" : "url(#accent)"}" opacity="${i === 3 ? 1 : 0.9}"/>`).join("");
  return `
  <g filter="url(#soft)">
    <rect x="${x}" y="${y}" width="${270 * s}" height="${200 * s}" rx="${26 * s}" fill="url(#card)" stroke="#fff" stroke-opacity=".22"/>
    ${ring(x + 100 * s, y + 100 * s, 52 * s, 0.92)}
    <text x="${x + 100 * s}" y="${y + 108 * s}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="${28 * s}" fill="#fff">92%</text>
    <rect x="${x + 176 * s}" y="${y + 70 * s}" width="${70 * s}" height="${10 * s}" rx="${5 * s}" fill="#fff" opacity=".6"/>
    <rect x="${x + 176 * s}" y="${y + 94 * s}" width="${50 * s}" height="${10 * s}" rx="${5 * s}" fill="#fff" opacity=".3"/>
    <rect x="${x + 176 * s}" y="${y + 118 * s}" width="${60 * s}" height="${10 * s}" rx="${5 * s}" fill="#fff" opacity=".3"/>
  </g>
  <g filter="url(#soft)">
    <rect x="${x + 150 * s}" y="${y + 230 * s}" width="${290 * s}" height="${190 * s}" rx="${26 * s}" fill="url(#card)" stroke="#fff" stroke-opacity=".22"/>
    <rect x="${cx0 + 28 * s}" y="${cy0 + 24 * s}" width="${90 * s}" height="${10 * s}" rx="${5 * s}" fill="#fff" opacity=".6"/>
    ${bars}
  </g>
  <g filter="url(#soft)">
    <rect x="${x - 70 * s}" y="${y + 120 * s}" width="${210 * s}" height="${108 * s}" rx="${22 * s}" fill="url(#card)" stroke="#fff" stroke-opacity=".22" transform="translate(0 ${-4 * s})"/>
    <circle cx="${x - 30 * s}" cy="${y + 172 * s}" r="${18 * s}" fill="#5EEAD4"/><path d="M${x - 39 * s} ${y + 172 * s} l${7 * s} ${8 * s} l${14 * s} ${-16 * s}" fill="none" stroke="#06111F" stroke-width="${4 * s}" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${x} " y="${y + 160 * s}" width="${96 * s}" height="${9 * s}" rx="${4 * s}" fill="#fff" opacity=".7"/>
    <rect x="${x}" y="${y + 180 * s}" width="${64 * s}" height="${9 * s}" rx="${4 * s}" fill="#fff" opacity=".35"/>
  </g>`;
}

function books(x, y, s = 1) {
  const b = (dx, dy, w, h, c) => `<rect x="${x + dx * s}" y="${y + dy * s}" width="${w * s}" height="${h * s}" rx="${6 * s}" fill="${c}"/><rect x="${x + (dx + 8) * s}" y="${y + (dy + h / 2 - 3) * s}" width="${(w - 16) * s}" height="${6 * s}" rx="${3 * s}" fill="#fff" opacity=".55"/>`;
  return `<g filter="url(#soft)">${b(0, 0, 150, 34, "#22D3EE")}${b(14, -34, 128, 32, "#F5B84B")}${b(6, -66, 138, 30, "#5EEAD4")}</g>`;
}

function cap(x, y, s = 1) {
  return `<g filter="url(#soft)"><polygon points="${x},${y} ${x + 90 * s},${y + 36 * s} ${x},${y + 72 * s} ${x - 90 * s},${y + 36 * s}" fill="#F5B84B"/>
  <path d="M${x - 52 * s} ${y + 58 * s} v${30 * s} q${52 * s} ${34 * s} ${104 * s} 0 v${-30 * s} l${-52 * s} ${22 * s} z" fill="#D9962B"/>
  <line x1="${x + 90 * s}" y1="${y + 36 * s}" x2="${x + 90 * s}" y2="${y + 92 * s}" stroke="#FFE2A3" stroke-width="${4 * s}"/><circle cx="${x + 90 * s}" cy="${y + 96 * s}" r="${7 * s}" fill="#FFE2A3"/></g>`;
}

function sparkles(list) {
  return list.map(([x, y, r]) => `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}z" fill="#fff" opacity=".85"/>`).join("");
}

const heroPortrait = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1500" width="1200" height="1500">${defs}
<rect width="1200" height="1500" fill="url(#bg)"/><rect width="1200" height="1500" fill="url(#dots)"/>
<circle cx="900" cy="330" r="520" fill="url(#glowC)"/><circle cx="160" cy="1220" r="560" fill="url(#glowT)"/>
<path d="M-40 1130 C 250 1040 520 1180 820 1090 S 1160 1060 1260 1110 V1500 H-40Z" fill="#06111F" opacity=".55"/>
${floatCards(560, 150, 1.0)}
${cap(250, 250, 1.1)}
${building(600, 1160, 1.55)}
${books(110, 1290, 1.2)}
${sparkles([[180, 560, 16], [1040, 760, 20], [920, 120, 12], [90, 900, 12], [700, 640, 10]])}
</svg>`;

const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 520" width="1600" height="520">${defs}
<rect width="1600" height="520" fill="url(#bg)"/><rect width="1600" height="520" fill="url(#dots)"/>
<circle cx="1250" cy="120" r="420" fill="url(#glowC)"/><circle cx="260" cy="560" r="380" fill="url(#glowT)"/>
<path d="M0 470 C 300 400 600 520 960 440 S 1450 430 1600 460 V520 H0Z" fill="#06111F" opacity=".5"/>
${floatCards(930, 70, 0.5)}
${building(1360, 492, 0.62)}
${cap(1470, 70, 0.5)}
${sparkles([[760, 90, 12], [820, 340, 9], [1500, 300, 14], [640, 430, 8]])}
</svg>`;

const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 420" width="560" height="420"><defs>
<linearGradient id="pg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5EEAD4"/><stop offset="1" stop-color="#22A6C8"/></linearGradient>
<linearGradient id="pg2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DE8F9"/><stop offset="1" stop-color="#2B8FB5"/></linearGradient>
<radialGradient id="gl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#22D3EE" stop-opacity=".35"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="280" cy="210" rx="250" ry="170" fill="url(#gl)"/>
<ellipse cx="280" cy="352" rx="170" ry="16" fill="#0B2E47" opacity=".18"/>
<path d="M280 128 C 220 96 140 100 92 124 V300 C 140 278 220 276 280 308 Z" fill="url(#pg1)"/>
<path d="M280 128 C 340 96 420 100 468 124 V300 C 420 278 340 276 280 308 Z" fill="url(#pg2)"/>
<path d="M280 128 V308" stroke="#0B2E47" stroke-opacity=".35" stroke-width="4"/>
<g stroke="#fff" stroke-opacity=".75" stroke-width="7" stroke-linecap="round"><path d="M126 160 H236"/><path d="M126 190 H226"/><path d="M126 220 H236"/><path d="M324 160 H434"/><path d="M334 190 H424"/><path d="M324 220 H414"/></g>
<circle cx="430" cy="92" r="34" fill="#F5B84B"/><path d="M414 92 l12 13 l22 -26" fill="none" stroke="#0B2E47" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M120 76 q0 -14 14 -14 q-14 0 -14 -14 q0 14 -14 14 q14 0 14 14z" fill="#22D3EE"/><circle cx="500" cy="230" r="7" fill="#5EEAD4"/><circle cx="64" cy="250" r="5" fill="#F5B84B"/>
</svg>`;

const backup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 440" width="720" height="440"><defs>
<linearGradient id="cy" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1B7F95"/><stop offset=".5" stop-color="#3CC7DB"/><stop offset="1" stop-color="#1B7F95"/></linearGradient>
<linearGradient id="top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9AF1FF"/><stop offset="1" stop-color="#3FB7D0"/></linearGradient>
<linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2DD4BF"/><stop offset="1" stop-color="#0E7490"/></linearGradient>
<radialGradient id="gl2" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#22D3EE" stop-opacity=".35"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="320" cy="220" rx="300" ry="190" fill="url(#gl2)"/>
<ellipse cx="320" cy="400" rx="180" ry="16" fill="#0B2E47" opacity=".2"/>
${[0, 1, 2].map((i) => { const y = 120 + i * 82; return `<path d="M170 ${y} v54 a150 36 0 0 0 300 0 v-54 z" fill="url(#cy)"/><ellipse cx="320" cy="${y}" rx="150" ry="36" fill="url(#top)"/><circle cx="${420}" cy="${y + 52}" r="6" fill="#F5B84B"/><circle cx="${440}" cy="${y + 52}" r="6" fill="#0B2E47" opacity=".5"/>`; }).join("")}
<path d="M520 176 L616 208 V288 C616 342 574 376 520 398 C466 376 424 342 424 288 V208 Z" fill="url(#sh)" stroke="#E6FBFF" stroke-width="6" transform="translate(0 -20)"/>
<path d="M480 288 l30 32 l56 -64" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -20)"/>
<g transform="translate(560 90)"><circle r="44" fill="#0B2E47" stroke="#7DE8F9" stroke-width="6"/><g stroke="#E6FBFF" stroke-width="5" stroke-linecap="round"><path d="M0 -30 V-22"/><path d="M30 0 H22"/><path d="M0 30 V22"/><path d="M-30 0 H-22"/></g><path d="M0 0 V-24" stroke="#F5B84B" stroke-width="6" stroke-linecap="round"/><path d="M0 0 L-16 0" stroke="#fff" stroke-width="6" stroke-linecap="round"/></g>
<path d="M90 90 q0 -14 14 -14 q-14 0 -14 -14 q0 14 -14 14 q14 0 14 14z" fill="#22D3EE"/><circle cx="70" cy="300" r="7" fill="#F5B84B"/><circle cx="660" cy="300" r="6" fill="#5EEAD4"/>
</svg>`;

const og = heroPortrait.replace('viewBox="0 0 1200 1500" width="1200" height="1500"', 'viewBox="0 150 1200 630" width="1200" height="630"');

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B2E47"/><stop offset="1" stop-color="#166E7A"/></linearGradient></defs>
<rect width="512" height="512" rx="116" fill="url(#g)"/><circle cx="380" cy="130" r="150" fill="#22D3EE" opacity=".25"/>
<text x="256" y="318" text-anchor="middle" font-family="Inter,Arial,Helvetica,sans-serif" font-weight="800" font-size="188" letter-spacing="-6" fill="#E6FBFF">9-B</text>
<rect x="150" y="352" width="212" height="16" rx="8" fill="#F5B84B"/></svg>`;

(async () => {
  const w = (svg, name, opts) => sharp(Buffer.from(svg), { density: 144 }).resize(opts.w, opts.h).webp({ quality: opts.q ?? 80, effort: 6 }).toFile(path.join(out, name));
  await w(heroPortrait, "login-hero.webp", { w: 1000, h: 1250, q: 78 });
  await w(banner, "dashboard-banner.webp", { w: 1600, h: 520, q: 80 });
  await w(banner, "banner-mobile.webp", { w: 800, h: 260, q: 78 });
  await w(empty, "empty-state.webp", { w: 560, h: 420, q: 88 });
  await w(backup, "backup-shield.webp", { w: 720, h: 440, q: 88 });
  await w(og, "og-cover.webp", { w: 1200, h: 630, q: 80 });
  await sharp(Buffer.from(icon)).resize(512, 512).png().toFile(path.join(out, "icon-512.png"));
  await sharp(Buffer.from(icon)).resize(180, 180).png().toFile(path.join(out, "apple-touch-icon.png"));
  require("fs").writeFileSync(path.join(__dirname, "..", "public", "icon.svg"), icon);
  console.log("tayyor");
})();
