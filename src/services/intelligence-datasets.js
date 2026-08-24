// Carga de datasets sintéticos reproducibles.
//
// Los datasets viven en `examples/datasets/` y son la fuente por defecto del
// producto: permiten ejecutar el pipeline completo, las pruebas y la demo sin
// tocar la red y sin revelar a ningún tercero qué se está investigando.
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../config.js";

export const DATASET_DIRECTORY = path.join(PROJECT_ROOT, "examples", "datasets");

// Identificador restringido a propósito: es lo único que separa este cargador
// de una lectura arbitraria del sistema de archivos.
const DATASET_ID = /^[0-9a-z][0-9a-z-]{2,60}$/;

function rejected(message, code = "DATASET_REJECTED", statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function listDatasets() {
  const entries = await fs.readdir(DATASET_DIRECTORY);
  const datasets = [];
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    const dataset = JSON.parse(await fs.readFile(path.join(DATASET_DIRECTORY, entry), "utf8"));
    datasets.push({
      id: dataset.id,
      title: dataset.title,
      description: dataset.description,
      network: dataset.network,
      transactions: (dataset.transactions || []).length,
      evaluateAt: dataset.evaluateAt,
      expected: dataset.expected
    });
  }
  return datasets;
}

export async function loadDataset(id) {
  const identifier = String(id || "").trim().toLowerCase();
  if (!DATASET_ID.test(identifier)) {
    throw rejected("datasetId contains unsupported characters.");
  }
  const target = path.join(DATASET_DIRECTORY, identifier + ".json");
  // Defensa en profundidad: aunque el patrón ya lo impide, se comprueba que la
  // ruta resuelta siga dentro del directorio de datasets.
  if (path.relative(DATASET_DIRECTORY, target).includes("..")) {
    throw rejected("datasetId resolved outside the dataset directory.", "DATASET_PATH_REJECTED");
  }
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw rejected("Dataset not found: " + identifier, "DATASET_NOT_FOUND", 404);
    throw error;
  }
}

/**
 * Ingiere un dataset completo: primero sus registros locales (contratos
 * marcados, drainers, exploits) y después sus transacciones, de modo que el
 * análisis posterior disponga del contexto que el escenario declara.
 */
export async function ingestDataset(intelligenceService, id, actor = "local-analyst") {
  const dataset = await loadDataset(id);
  const registries = dataset.registries || {};
  for (const kind of ["contracts", "drainers", "bridges"]) {
    for (const record of registries[kind] || []) {
      await intelligenceService.registerLocalRecord(kind, record, actor);
    }
  }
  for (const exploit of registries.exploits || []) {
    await intelligenceService.registerExploit(exploit, actor);
  }
  const run = await intelligenceService.ingest(
    {
      blocks: dataset.blocks || [],
      transactions: dataset.transactions || [],
      source: { kind: "local-dataset", id: dataset.id, endpoint: "examples/datasets/" + dataset.id + ".json" },
      datasetId: dataset.id
    },
    actor
  );
  return { dataset: { id: dataset.id, title: dataset.title, expected: dataset.expected }, run };
}
