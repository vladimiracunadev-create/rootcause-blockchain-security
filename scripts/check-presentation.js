// Comprueba que la muestra del producto se generó completa y que el README no
// promete un documento distinto del que se publica.
//
// Los PDF no se versionan —se generan en cada publicación—, así que nada sujeta
// las cifras que anuncia el README salvo esta comprobación: si alguien añade una
// diapositiva, un anexo o dos minutos a docs/presentacion.md y no toca el texto,
// aquí se nota. Es el mismo criterio que aplica check-rule-coverage.js a las
// reglas: una afirmación de la documentación que nadie verifica envejece sola.
//
// Se ejecuta después de `pnpm build:presentacion`.
//
// Uso: node scripts/check-presentation.js
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../src/config.js";

const FUENTE = "docs/presentacion.md";
const DECK = "presentacion/PRESENTACION.pdf";
const PAUTA = "presentacion/PAUTA.pdf";
const PAUTA_HTML = "presentacion/pauta.html";
const MINIMO_LAMINAS = 6;
const MINIMO_PAGINAS_PAUTA = 6;

const errores = [];
const leer = (relativo) => fs.readFile(path.join(PROJECT_ROOT, relativo), "utf8");

function fallar(mensaje) {
  errores.push(mensaje);
}

function terminar() {
  if (errores.length) {
    console.error(errores.map((error) => "- " + error).join("\n"));
    process.exit(1);
  }
}

async function paginas(relativo) {
  const absoluto = path.join(PROJECT_ROOT, relativo);
  let datos;
  try {
    datos = await fs.readFile(absoluto);
  } catch {
    fallar("No existe " + relativo + ". Ejecuta antes: pnpm build:presentacion");
    return null;
  }
  // Contar objetos /Type /Page, excluyendo /Pages, que es el nodo del árbol.
  const total = (datos.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (total === 0) {
    fallar(relativo + " no declara ninguna página: la generación falló.");
    return null;
  }
  const { size } = await fs.stat(absoluto);
  return { total, kb: Math.round(size / 1024) };
}

const fuente = await leer(FUENTE);

// ── La fuente declara lo que la muestra debería tener ───────────────────────
const laminasDeclaradas = (fuente.match(/^##\s+\d+\s*·\s+/gm) || []).length;
if (laminasDeclaradas < MINIMO_LAMINAS) {
  fallar(FUENTE + " define " + laminasDeclaradas + " diapositivas: se esperaban al menos " + MINIMO_LAMINAS + ".");
  terminar();
}

const anexosDeclarados = (fuente.match(/^##\s+Anexo\s*·\s+/gm) || []).length;
if (anexosDeclarados < 1) {
  fallar(FUENTE + ' no define ningún anexo del expositor ("## Anexo · Título").');
}

const minutos = [...fuente.matchAll(/\*\*Pauta\s*·\s*(\d+)\s*min\.?\*\*/g)].reduce(
  (total, coincidencia) => total + Number(coincidencia[1]),
  0
);

// Ningún marcador puede llegar sin rellenar al documento generado: una lámina
// que proyecta "{{invariantes}}" a pantalla completa es peor que no tener lámina.
const pendientes = new Set((fuente.match(/\{\{[a-z0-9-]+\}\}/gi) || []).map((marca) => marca));

// ── El PDF de diapositivas tiene una página por lámina ──────────────────────
const deck = await paginas(DECK);
if (deck && deck.total !== laminasDeclaradas) {
  fallar(
    "El PDF de diapositivas tiene " + deck.total + " páginas y " + FUENTE + " define " +
      laminasDeclaradas + " diapositivas: alguna lámina se desbordó a dos páginas."
  );
}

const pauta = await paginas(PAUTA);
if (pauta && pauta.total < MINIMO_PAGINAS_PAUTA) {
  fallar("La pauta solo tiene " + pauta.total + " páginas: el guion no se generó completo.");
}

// ── Cada lámina llega a la pauta con sus dos bloques ────────────────────────
//
// Si el guion o las indicaciones se pierden, la pauta sigue pareciendo correcta
// —tiene texto— pero quien expone acaba leyendo en voz alta una instrucción de
// escena delante de la sala.
let pautaHtml = "";
try {
  pautaHtml = await leer(PAUTA_HTML);
} catch {
  fallar("No existe " + PAUTA_HTML + ". Ejecuta antes: pnpm build:presentacion");
  terminar();
}

for (const [clase, que] of [
  ["guion", "el guion hablado"],
  ["indicaciones", "las indicaciones"]
]) {
  const encontrados = (pautaHtml.match(new RegExp('class="' + clase + '"', "g")) || []).length;
  if (encontrados !== laminasDeclaradas) {
    fallar(
      "La pauta tiene " + encontrados + " bloques con " + que + " y la presentación tiene " +
        laminasDeclaradas + " diapositivas: alguna lámina se quedó sin su parte."
    );
  }
}

const anexosRenderizados = (pautaHtml.match(/class="anexo"/g) || []).length;
if (anexosRenderizados !== anexosDeclarados) {
  fallar(
    FUENTE + " define " + anexosDeclarados + " anexos y la pauta generada tiene " +
      anexosRenderizados + ": alguno no llegó al documento."
  );
}

for (const documento of ["presentacion/presentacion.html", PAUTA_HTML]) {
  const html = await leer(documento);
  for (const marcador of pendientes) {
    if (html.includes(marcador)) {
      fallar("El marcador " + marcador + " llegó sin rellenar a " + documento + ".");
    }
  }
  // Las diapositivas se llevan a un pendrive y se proyectan en la sala de otro:
  // si dependieran de una imagen externa, se abriría un hueco gris delante del
  // público. Es la misma regla que cumple el panel del producto.
  const remotas = html.match(/(?:src|href)="https?:\/\/[^"]+\.(?:png|jpe?g|svg|css|js)"/gi) || [];
  if (remotas.length) {
    fallar(documento + " referencia recursos externos: " + [...new Set(remotas)].join(", "));
  }
}

// ── El README anuncia exactamente lo que se publica ─────────────────────────
const readme = await leer("README.md");

const anunciadas = /PRESENTACION\.pdf \((\d+) diapositivas\)/.exec(readme);
if (!anunciadas) {
  fallar("El README ya no declara el número de diapositivas de la presentación.");
} else if (Number(anunciadas[1]) !== laminasDeclaradas) {
  fallar(
    "El README anuncia " + anunciadas[1] + " diapositivas y la presentación tiene " +
      laminasDeclaradas + ". Actualiza la cifra en README.md."
  );
}

const duracionReadme = /≈\*\*(\d+) minutos\*\*|\*\*≈(\d+) minutos\*\*/.exec(readme);
if (!duracionReadme) {
  fallar("El README ya no declara la duración de la presentación (≈**N minutos**).");
} else if (Number(duracionReadme[1] ?? duracionReadme[2]) !== minutos) {
  fallar(
    "El README anuncia ≈" + (duracionReadme[1] ?? duracionReadme[2]) + " minutos de charla y las " +
      "pautas suman " + minutos + ". Actualiza la cifra en README.md."
  );
}

const anexosReadme = /\*\*(\d+) anexos\*\*/.exec(readme);
if (!anexosReadme) {
  fallar("El README ya no declara cuántos anexos trae la pauta del expositor (**N anexos**).");
} else if (Number(anexosReadme[1]) !== anexosDeclarados) {
  fallar("El README anuncia " + anexosReadme[1] + " anexos y la pauta trae " + anexosDeclarados + ".");
}

terminar();

console.log(
  "Presentación: " + deck.total + " diapositivas (" + deck.kb + " KB), ≈" + minutos +
    " min, y pauta de " + pauta.total + " páginas con " + anexosDeclarados + " anexos (" +
    pauta.kb + " KB) — coincide con lo anunciado en el README."
);
