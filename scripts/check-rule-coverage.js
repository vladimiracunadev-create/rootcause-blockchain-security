// El motor de reglas, el catálogo de controles, las políticas y el README
// tienen que hablar del mismo conjunto de detecciones.
//
// El fallo que este gate persigue no es un bug de código: es una regla nueva
// que se añade al motor y no llega al catálogo. El operador ve entonces un
// incidente cuyo código no aparece en ninguna parte, no sabe qué control ha
// fallado y no encuentra el runbook. La deriva es silenciosa y solo se nota
// durante un incidente real, que es el peor momento posible.
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../src/config.js";

const RULE_CODE = /\bBLK-[A-Z]+-\d{3}\b/g;

const errors = [];

function fail(message) {
  errors.push(message);
}

async function readText(relativePath) {
  return fs.readFile(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function difference(left, right) {
  return [...left].filter((value) => !right.has(value));
}

// ── Fuente de verdad: los códigos que el motor puede emitir ────────────────
// El motor vive en dos módulos: el núcleo (proyectos, eventos, nodo) y el
// dominio de wallets. Ambos cuentan.
const engineSource =
  (await readText("src/domain/rule-engine.js")) +
  "\n" +
  (await readText("src/domain/wallet-rules.js"));
const emitted = new Set(
  [...engineSource.matchAll(/code:\s*"(BLK-[A-Z]+-\d{3})"/g)].map((match) => match[1])
);
if (emitted.size === 0) {
  fail("El motor de reglas no emite ningún código BLK-*: la extracción falló.");
}

// Cada código se emite una sola vez, salvo BLK-WALLET-008, que reporta varias
// sub-causas de actividad inesperada (reactivación, red, ventana, contraparte)
// bajo un mismo control y con discriminadores distintos.
const MULTI_EMITTERS = new Set(["BLK-WALLET-008"]);
const emittedList = [...engineSource.matchAll(/code:\s*"(BLK-[A-Z]+-\d{3})"/g)].map((m) => m[1]);
const duplicates = emittedList.filter(
  (code, index) => emittedList.indexOf(code) !== index && !MULTI_EMITTERS.has(code)
);
for (const code of new Set(duplicates)) {
  fail("El motor emite el código " + code + " desde más de una regla.");
}

// ── 1. Catálogo de controles ───────────────────────────────────────────────
const catalog = JSON.parse(await readText("config/control-catalog.json"));
const catalogRules = new Set();
for (const control of catalog.controls || []) {
  if (!Array.isArray(control.rules) || control.rules.length === 0) {
    fail("El control " + control.id + " no declara ninguna regla.");
    continue;
  }
  for (const code of control.rules) {
    if (catalogRules.has(code)) {
      fail("El código " + code + " está asignado a más de un control.");
    }
    catalogRules.add(code);
  }
}
for (const code of difference(emitted, catalogRules)) {
  fail("El código " + code + " se emite pero no pertenece a ningún control del catálogo.");
}
for (const code of difference(catalogRules, emitted)) {
  fail("El catálogo declara " + code + ", que ninguna regla emite.");
}

// ── 2. Políticas ───────────────────────────────────────────────────────────
const policies = JSON.parse(await readText("config/policies.json"));
const policyRules = new Set(policies.rules || []);
for (const code of difference(emitted, policyRules)) {
  fail("El código " + code + " se emite pero no está listado en config/policies.json.");
}
for (const code of difference(policyRules, emitted)) {
  fail("config/policies.json lista " + code + ", que ninguna regla emite.");
}

// ── 3. README ──────────────────────────────────────────────────────────────
const readme = await readText("README.md");
const documented = new Set(readme.match(RULE_CODE) || []);
for (const code of difference(emitted, documented)) {
  fail("El código " + code + " no aparece en la tabla de reglas del README.");
}
for (const code of difference(documented, emitted)) {
  fail("El README documenta " + code + ", que ninguna regla emite.");
}

if (errors.length) {
  console.error(errors.map((error) => "- " + error).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Reglas coherentes: " +
      emitted.size +
      " códigos emitidos, mapeados a " +
      (catalog.controls || []).length +
      " controles, y documentados en política y README."
  );
}
