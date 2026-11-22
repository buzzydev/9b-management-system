#!/usr/bin/env node
/**
 * Statik tekshiruv (node_modules kerak emas):
 *  - har bir .ts/.tsx fayl sintaksis xatosiz tahlil qilinadi (TypeScript parser)
 *  - "@/..." va nisbiy importlar mavjud faylga ishora qilishi shart
 *  - lokal modullardan olingan nomlar (named import) o'sha modulda eksport qilinganligi tekshiriladi
 *  - tashqi paketlar package.json'da e'lon qilingan bo'lishi shart
 *  - "use client" fayllari next/headers, @/lib/db, @/lib/auth kabi server modullarni import qilmasligi kerak
 *  - route fayllari ruxsat etilmagan nomlarni eksport qilmasligi kerak
 * To'liq tip tekshiruvi uchun `npm install && npm run typecheck`.
 */
const fs = require("fs");
const path = require("path");
let ts;
try {
  ts = require("typescript");
} catch {
  ts = require("/opt/npm-tools/node_modules/typescript");
}

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
const NODE_BUILTIN = new Set(require("module").builtinModules);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) files.push(p);
  }
})(path.join(root, "src"));
for (const extra of ["tests"]) {
  const d = path.join(root, extra);
  if (fs.existsSync(d)) fs.readdirSync(d).filter((f) => f.endsWith(".ts")).forEach((f) => files.push(path.join(d, f)));
}

const errors = [];
const err = (f, msg) => errors.push(`${path.relative(root, f)}: ${msg}`);

function parse(file) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return { text, sf };
}

const exportCache = new Map();
function exportsOf(file) {
  if (exportCache.has(file)) return exportCache.get(file);
  const { sf } = parse(file);
  const names = new Set();
  let star = [];
  const hasMod = (n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDefault = (n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (!st.exportClause) {
        if (st.moduleSpecifier) star.push(st.moduleSpecifier.text);
      } else if (ts.isNamedExports(st.exportClause)) st.exportClause.elements.forEach((e) => names.add(e.name.text));
    } else if (ts.isExportAssignment(st)) names.add("default");
    else if (hasMod(st)) {
      if (isDefault(st)) names.add("default");
      if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => collectBinding(d.name, names));
      else if (st.name) names.add(st.name.text);
    }
  }
  const res = { names, star };
  exportCache.set(file, res);
  return res;
}
function collectBinding(n, set) {
  if (ts.isIdentifier(n)) set.add(n.text);
  else n.elements?.forEach((e) => !ts.isOmittedExpression(e) && collectBinding(e.name, set));
}
function resolveModule(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else base = path.resolve(path.dirname(from), spec);
  for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx"), base]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
function hasExport(file, name, seen = new Set()) {
  if (seen.has(file)) return false;
  seen.add(file);
  const e = exportsOf(file);
  if (e.names.has(name)) return true;
  return e.star.some((s) => {
    const r = resolveModule(file, s);
    return r ? hasExport(r, name, seen) : false;
  });
}

const ROUTE_ALLOWED = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "dynamic", "revalidate", "runtime", "maxDuration", "fetchCache", "preferredRegion", "dynamicParams"]);
const SERVER_ONLY = ["@/lib/dates", "@/lib/permissions-server", "next/headers", "@/lib/db", "@/lib/auth", "@/lib/api", "@/lib/audit", "@/lib/notify", "@/lib/storage", "@/lib/env", "node:fs", "node:fs/promises", "node:path", "node:crypto", "bcryptjs", "@prisma/client", "exceljs", "jspdf"];

for (const f of files) {
  const { text, sf } = parse(f);
  const diags = sf.parseDiagnostics || [];
  for (const d of diags) {
    const { line } = sf.getLineAndCharacterOfPosition(d.start);
    err(f, `sintaksis xatosi (qator ${line + 1}): ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
  }
  const isClient = /^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text);
  const rel = path.relative(root, f).replace(/\\/g, "/");
  const isRoute = /\/route\.ts$/.test(rel);

  for (const st of sf.statements) {
    if ((ts.isImportDeclaration(st) || (ts.isExportDeclaration(st) && st.moduleSpecifier)) && st.moduleSpecifier) {
      const spec = st.moduleSpecifier.text;
      const typeOnly = ts.isImportDeclaration(st) && st.importClause?.isTypeOnly;
      if (spec.startsWith("@/") || spec.startsWith(".")) {
        const target = resolveModule(f, spec);
        if (!target) {
          err(f, `import topilmadi: "${spec}"`);
          continue;
        }
        if (ts.isImportDeclaration(st) && st.importClause) {
          const ic = st.importClause;
          if (ic.name && !hasExport(target, "default")) err(f, `"${spec}" da default eksport yo'q`);
          if (ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
            for (const el of ic.namedBindings.elements) {
              const nm = (el.propertyName ?? el.name).text;
              if (!hasExport(target, nm)) err(f, `"${spec}" da "${nm}" eksport qilinmagan`);
            }
          }
        }
        if (isClient && !typeOnly && SERVER_ONLY.some((s) => spec === s)) err(f, `"use client" fayl server modulini import qilmoqda: ${spec}`);
      } else {
        const pkgName = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        const isBuiltin = spec.startsWith("node:") || NODE_BUILTIN.has(pkgName);
        if (!isBuiltin && !declared.has(pkgName) && pkgName !== "react" && pkgName !== "react-dom") err(f, `package.json'da yo'q paket: ${pkgName}`);
        if (isClient && !typeOnly && SERVER_ONLY.includes(spec)) err(f, `"use client" fayl server modulini import qilmoqda: ${spec}`);
      }
    }
  }

  if (isRoute) {
    for (const n of exportsOf(f).names) if (!ROUTE_ALLOWED.has(n)) err(f, `route faylida ruxsat etilmagan eksport: ${n}`);
  }
  if (/\/page\.tsx$/.test(rel) && !exportsOf(f).names.has("default")) err(f, "page faylida default eksport yo'q");
}

console.log(`Tekshirildi: ${files.length} fayl`);
if (errors.length) {
  console.error(`\n${errors.length} ta muammo:\n` + errors.map((e) => " - " + e).join("\n"));
  process.exit(1);
}
console.log("Statik tekshiruv: muammo topilmadi ✔");
