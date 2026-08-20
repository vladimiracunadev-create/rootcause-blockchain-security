// Verifica el claim central de distribución: esta aplicación se ejecuta entera
// en la máquina del operador, sin árbol de dependencias y sin pedirle nada a un
// tercero en tiempo de ejecución.
//
// Si alguien añade una dependencia npm, un CDN en el dashboard, un SDK de
// cadena o abre la CSP, este script tumba el build.
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../src/config.js";

const errors = [];

function fail(message) {
  errors.push(message);
}

async function readText(relativePath) {
  return fs.readFile(path.join(PROJECT_ROOT, relativePath), "utf8");
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(PROJECT_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (["node_modules", ".git", "data", "build", "dist", "target"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(target)));
    else results.push(target);
  }
  return results;
}

// ── 1. Cero dependencias declaradas ─────────────────────────────────────────
const manifest = JSON.parse(await readText("package.json"));
for (const field of [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundledDependencies"
]) {
  const declared = Object.keys(manifest[field] || {});
  if (declared.length > 0) {
    fail("package.json declara " + field + ": " + declared.join(", "));
  }
}

// ── 2. Cero árbol instalado y cero lockfiles de otros gestores ──────────────
for (const forbidden of ["node_modules", "package-lock.json", "yarn.lock", "npm-shrinkwrap.json"]) {
  if (await exists(forbidden)) fail("Artefacto de dependencias presente: " + forbidden);
}

if (await exists("pnpm-lock.yaml")) {
  const lock = await readText("pnpm-lock.yaml");
  if (/^packages:/m.test(lock) || /^snapshots:/m.test(lock)) {
    fail("pnpm-lock.yaml contiene paquetes descargados; el repositorio debe quedar vacío de dependencias.");
  }
}

// ── 3. Todo import es un builtin `node:` o una ruta relativa del propio repo ─
//
// En un proyecto multi-chain esta es la regla que más presión recibe: cada
// cadena trae su SDK oficial y cada SDK trae un árbol. El motor habla JSON-RPC
// a mano precisamente para no acoplarse a ninguno.
const files = (await walk(PROJECT_ROOT)).filter((file) => file.endsWith(".js"));
const importPattern =
  /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
for (const file of files) {
  const content = await fs.readFile(file, "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] || match[2];
    if (!specifier) continue;
    const isBuiltin = specifier.startsWith("node:");
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (!isBuiltin && !isRelative) {
      fail(
        "Import externo en " +
          path.relative(PROJECT_ROOT, file) +
          ": " +
          specifier +
          " (usa node: o una ruta relativa)"
      );
    }
  }
}

// ── 4. El dashboard no puede traer nada de fuera ────────────────────────────
//    Ni CDN, ni fuentes remotas, ni un explorador de bloques embebido: todo el
//    origen es el propio proceso local.
const staticDir = path.join(PROJECT_ROOT, "src", "web", "static");
for (const file of await walk(staticDir)) {
  const raw = await fs.readFile(file, "utf8");
  // Los namespaces XML (xmlns="http://www.w3.org/2000/svg") son identificadores,
  // no descargas: el navegador nunca los resuelve.
  const content = raw.replace(/xmlns(?::[a-z]+)?="[^"]*"/gi, "");
  const remote = content.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  if (remote.length > 0) {
    fail(
      "Referencia remota en " +
        path.relative(PROJECT_ROOT, file) +
        ": " +
        [...new Set(remote)].join(", ")
    );
  }
}

// ── 5. La CSP servida debe seguir siendo self-only ──────────────────────────
const appSource = await readText("src/app.js");
const cspLine = appSource.match(/"(default-src[^"]+)"/);
if (!cspLine) {
  fail("No se encontró la Content-Security-Policy en src/app.js.");
} else {
  const policy = cspLine[1];
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'"
  ]) {
    if (!policy.includes(directive)) fail("La CSP perdió la directiva: " + directive);
  }
  if (/https?:/.test(policy) || /\*/.test(policy) || /unsafe-(?:inline|eval)/.test(policy)) {
    fail("La CSP permite orígenes externos o código inline: " + policy);
  }
}

// ── 6. Ningún proveedor RPC alojado escrito en el código ────────────────────
//
// Un endpoint de Infura, Alchemy o similar incrustado convertiría la aplicación
// en cliente de un tercero que vería el inventario completo del operador.
const hostedProviders =
  /\b(?:infura\.io|alchemy\.com|alchemyapi\.io|quicknode\.(?:pro|com)|ankr\.com|blastapi\.io|drpc\.org|chainstack\.com|moralis\.io|etherscan\.io|blockdaemon\.com)\b/i;
for (const file of await walk(path.join(PROJECT_ROOT, "src"))) {
  const content = await fs.readFile(file, "utf8");
  const found = content.match(hostedProviders);
  if (found) {
    fail(
      "Proveedor RPC alojado referenciado en " +
        path.relative(PROJECT_ROOT, file) +
        ": " +
        found[0]
    );
  }
}

if (errors.length) {
  console.error(errors.map((error) => "- " + error).join("\n"));
  process.exit(1);
}

console.log("Claim solo-local verificado: cero dependencias, cero orígenes remotos, cero proveedores alojados.");
