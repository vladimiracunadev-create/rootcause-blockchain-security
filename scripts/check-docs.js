// Comprueba que la documentación no promete archivos que no existen.
//
// Un README que remite a docs/RUNBOOK.md cuando ese archivo se renombró es peor
// que un README incompleto: envía a quien responde un incidente a buscar algo
// que no está.
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../src/config.js";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "data", "build", "coverage"]);

// Rutas que aparecen en la documentación pero se crean en tiempo de ejecución
// o al empaquetar, no en el repositorio.
const RUNTIME_PATHS = new Set([
  "data/state.enc.json",
  "build/portable",
  "packaging/windows/rootcause.ico"
]);

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(target)));
    else results.push(target);
  }
  return results;
}

async function exists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

const errors = [];
let referencesChecked = 0;

const markdownFiles = (await walk(PROJECT_ROOT)).filter((file) => file.endsWith(".md"));

const markdownLink = /\]\(([^)\s]+)\)/g;
const barePath =
  /(?<![\w/.-])((?:docs|config|src|scripts|test|examples|packaging)\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]{1,6})/g;

for (const file of markdownFiles) {
  const content = await fs.readFile(file, "utf8");
  const directory = path.dirname(file);
  const relativeFile = path.relative(PROJECT_ROOT, file);

  for (const match of content.matchAll(markdownLink)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const cleaned = target.split("#")[0];
    if (!cleaned) continue;
    if (RUNTIME_PATHS.has(cleaned)) continue;
    referencesChecked += 1;
    const resolved = cleaned.startsWith("/")
      ? path.join(PROJECT_ROOT, cleaned)
      : path.resolve(directory, cleaned);
    if (!(await exists(resolved))) {
      errors.push(relativeFile + " enlaza a un archivo inexistente: " + cleaned);
    }
  }

  for (const match of content.matchAll(barePath)) {
    const target = match[1];
    if (RUNTIME_PATHS.has(target)) continue;
    referencesChecked += 1;
    if (!(await exists(path.join(PROJECT_ROOT, target)))) {
      errors.push(relativeFile + " menciona una ruta inexistente: " + target);
    }
  }
}

if (errors.length) {
  console.error([...new Set(errors)].map((error) => "- " + error).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Documentación coherente: " +
      referencesChecked +
      " referencias verificadas en " +
      markdownFiles.length +
      " documentos."
  );
}
