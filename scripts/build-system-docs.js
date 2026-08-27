// Genera la documentacion del sistema en HTML y PDF desde los Markdown de
// docs/system-documentation/.
//
// Los Markdown son la fuente unica. Mantener a mano una segunda version en PDF
// es garantizar que las dos se separen: por eso aqui no se edita contenido, solo
// se renderiza.
//
// Sin dependencias, como el resto del repositorio:
//
//   - el Markdown lo convierte scripts/lib/markdown.js, escrito a mano;
//   - el PDF lo imprime un Chrome o un Edge ya instalado en el sistema, al que
//     se le habla por el protocolo DevTools con el WebSocket que trae Node.
//
// Es la misma decision que toma scripts/render-presentation-pdf.js, y por la
// misma razon: `scripts/check-local-only.js` prohibe cualquier import que no sea
// `node:` o una ruta relativa, y esa regla no admite excepciones "solo para las
// herramientas".
//
// Limitacion conocida y deliberada: los bloques ```mermaid se renderizan como
// figura encuadrada con su titulo y su codigo fuente, no como imagen. Dibujarlos
// exigiria incorporar la libreria Mermaid, que es exactamente la dependencia que
// este repositorio no acepta. Cada diagrama de la documentacion lleva su
// explicacion en prosa, asi que el PDF no pierde informacion: solo la
// ilustracion.
//
// Uso:
//   node scripts/build-system-docs.js            genera HTML y PDF
//   node scripts/build-system-docs.js --html     solo HTML (no necesita navegador)
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { PROJECT_ROOT } from "../src/config.js";
import { renderMarkdown } from "./lib/markdown.js";

const ORIGEN = path.join(PROJECT_ROOT, "docs", "system-documentation");
const SALIDA_PDF = path.join(ORIGEN, "pdf");
const ESPERA_ARRANQUE_MS = 20000;
const ESPERA_CARGA_MS = 60000;
const SOLO_HTML = process.argv.includes("--html");

// ── Metadatos de portada ────────────────────────────────────────────────────

const manifiesto = JSON.parse(
  await fs.readFile(path.join(PROJECT_ROOT, "package.json"), "utf8")
);
const VERSION = manifiesto.version;
const SISTEMA = "RootCause Blockchain Security";
const FECHA = new Date().toISOString().slice(0, 10);

// ── Renderizado ─────────────────────────────────────────────────────────────

function escapar(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Aparta los bloques ```mermaid antes de convertir el Markdown y los devuelve
 * despues como figura. El marcador es alfanumerico a proposito: cualquier otra
 * cosa la transformaria el marcado en linea del renderizador.
 */
function apartarDiagramas(fuente) {
  const diagramas = [];
  const sinDiagramas = fuente.replace(
    /```mermaid\r?\n([\s\S]*?)```/g,
    (_, cuerpo) => {
      diagramas.push(cuerpo.replace(/\s+$/, ""));
      return "\n\nDIAGRAMA" + (diagramas.length - 1) + "DIAGRAMA\n\n";
    }
  );
  return { sinDiagramas, diagramas };
}

function devolverDiagramas(html, diagramas) {
  return html.replace(/<p>DIAGRAMA(\d+)DIAGRAMA<\/p>/g, (_, indice) => {
    const codigo = diagramas[Number(indice)];
    return (
      '<figure class="diagrama">' +
      '<figcaption>Diagrama (Mermaid) — la explicacion en prosa acompaña siempre a la figura</figcaption>' +
      "<pre><code>" +
      escapar(codigo) +
      "</code></pre>" +
      "</figure>"
    );
  });
}

/** Titulo del documento: su primer encabezado de nivel 1. */
function tituloDe(fuente, respaldo) {
  const encabezado = /^#\s+(.+)$/m.exec(fuente);
  return encabezado ? encabezado[1].trim() : respaldo;
}

/**
 * Indice del documento a partir de sus encabezados de nivel 2. Solo se genera
 * cuando hay suficientes como para que aporte algo: un indice de dos entradas
 * ocupa una pagina y no ayuda a nadie.
 */
function indiceDe(fuente) {
  // El indice muestra el texto plano del encabezado: el marcado en linea
  // (negrita, codigo, enlaces) se retira en vez de renderizarse, porque un
  // indice con tipografia mezclada se lee peor que uno uniforme.
  const limpiar = (texto) =>
    texto
      .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
      .replace(/[*`]/g, "")
      .trim();
  const entradas = [...fuente.matchAll(/^##\s+(.+)$/gm)].map((coincidencia) =>
    limpiar(coincidencia[1])
  );
  if (entradas.length < 4) return "";
  return (
    '<nav class="indice"><h2>Contenido</h2><ol>' +
    entradas.map((entrada) => "<li>" + escapar(entrada) + "</li>").join("") +
    "</ol></nav>"
  );
}

const ESTILO = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.55; color: #14181f; background: #fff;
  margin: 0; padding: 0;
}
.portada {
  border-bottom: 3px solid #0b1020; padding-bottom: 14pt; margin-bottom: 22pt;
  page-break-after: avoid;
}
.portada .sistema { font-size: 9pt; letter-spacing: .16em; text-transform: uppercase; color: #5a6473; margin: 0 0 6pt; }
.portada .titulo { font-size: 21pt; font-weight: 700; margin: 0 0 8pt; color: #0b1020; }
.portada .meta { font-size: 8.5pt; color: #5a6473; margin: 0; }
h1 { font-size: 17pt; color: #0b1020; margin: 22pt 0 8pt; page-break-after: avoid; }
h2 { font-size: 13pt; color: #0b1020; margin: 18pt 0 6pt; padding-bottom: 3pt;
     border-bottom: 1px solid #d8dde5; page-break-after: avoid; }
h3 { font-size: 11.5pt; color: #1d2634; margin: 14pt 0 5pt; page-break-after: avoid; }
h4 { font-size: 10.5pt; color: #1d2634; margin: 12pt 0 4pt; page-break-after: avoid; }
p { margin: 0 0 8pt; }
ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
li { margin-bottom: 3pt; }
a { color: #14509a; text-decoration: none; }
code { font-family: Consolas, "Courier New", monospace; font-size: 9pt;
       background: #f2f4f7; padding: 1pt 3pt; border-radius: 3px; }
pre { background: #f7f8fa; border: 1px solid #dfe4ea; border-radius: 5px;
      padding: 8pt 10pt; overflow-x: auto; page-break-inside: avoid; margin: 0 0 10pt; }
pre code { background: none; padding: 0; font-size: 8.5pt; line-height: 1.45; }
blockquote { border-left: 3px solid #14509a; background: #f3f7fc; margin: 0 0 10pt;
             padding: 7pt 12pt; page-break-inside: avoid; }
blockquote p:last-child { margin-bottom: 0; }
table { border-collapse: collapse; width: 100%; margin: 0 0 12pt; font-size: 8.5pt;
        page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background: #0b1020; color: #fff; text-align: left; padding: 5pt 7pt;
     font-weight: 600; border: 1px solid #0b1020; }
td { padding: 5pt 7pt; border: 1px solid #dfe4ea; vertical-align: top;
     word-break: break-word; }
tbody tr:nth-child(even) { background: #fafbfc; }
hr { border: 0; border-top: 1px solid #dfe4ea; margin: 16pt 0; }
.indice { background: #f7f8fa; border: 1px solid #dfe4ea; border-radius: 5px;
          padding: 8pt 14pt; margin: 0 0 18pt; page-break-inside: avoid; }
.indice h2 { border: 0; margin: 4pt 0 4pt; font-size: 11pt; }
.indice ol { font-size: 9pt; margin-bottom: 4pt; }
.diagrama { margin: 0 0 12pt; border: 1px solid #c7d2e0; border-radius: 5px;
            background: #f6f9fd; padding: 8pt 10pt; page-break-inside: avoid; }
.diagrama figcaption { font-size: 8pt; color: #4a5568;
            text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6pt; }
.diagrama pre { background: #fff; margin: 0; }
.documento + .documento { page-break-before: always; }
@page { size: A4; margin: 18mm 16mm 16mm; }
`;

function envolver(titulo, cuerpo, subtitulo) {
  return (
    "<!doctype html>\n" +
    '<html lang="es"><head><meta charset="utf-8">' +
    "<title>" +
    escapar(titulo) +
    "</title><style>" +
    ESTILO +
    "</style></head><body>" +
    '<header class="portada">' +
    '<p class="sistema">' +
    escapar(SISTEMA) +
    "</p>" +
    '<p class="titulo">' +
    escapar(titulo) +
    "</p>" +
    '<p class="meta">' +
    escapar(subtitulo) +
    "</p>" +
    "</header>" +
    cuerpo +
    "</body></html>"
  );
}

function documentoHtml(fuente) {
  const { sinDiagramas, diagramas } = apartarDiagramas(fuente);
  return devolverDiagramas(renderMarkdown(sinDiagramas), diagramas);
}

// ── Navegador headless por el protocolo DevTools ────────────────────────────

function localizarNavegador() {
  if (process.env.ROOTCAUSE_CHROME) {
    if (!fsSync.existsSync(process.env.ROOTCAUSE_CHROME)) {
      throw new Error(
        "ROOTCAUSE_CHROME apunta a un ejecutable que no existe: " + process.env.ROOTCAUSE_CHROME
      );
    }
    return process.env.ROOTCAUSE_CHROME;
  }
  const candidatos = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ];
  return candidatos.find((ruta) => fsSync.existsSync(ruta)) || null;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esperarPuerto(perfil) {
  const limite = Date.now() + ESPERA_ARRANQUE_MS;
  while (Date.now() < limite) {
    try {
      const crudo = await fs.readFile(path.join(perfil, "DevToolsActivePort"), "utf8");
      const [puerto, ruta] = crudo.split("\n");
      if (puerto && ruta && ruta.trim()) return { puerto: Number(puerto), ruta: ruta.trim() };
    } catch {
      // Todavia no existe: el navegador sigue arrancando.
    }
    await esperar(100);
  }
  throw new Error(
    "El navegador no publico su puerto de depuracion en " + ESPERA_ARRANQUE_MS / 1000 + " s."
  );
}

function abrirSesion(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pendientes = new Map();
    let siguienteId = 0;

    socket.onerror = () =>
      reject(new Error("No se pudo hablar con el navegador por el protocolo DevTools."));
    socket.onmessage = (evento) => {
      const mensaje = JSON.parse(evento.data);
      if (!mensaje.id || !pendientes.has(mensaje.id)) return;
      const { ok, ko } = pendientes.get(mensaje.id);
      pendientes.delete(mensaje.id);
      if (mensaje.error) ko(new Error(mensaje.method + ": " + JSON.stringify(mensaje.error)));
      else ok(mensaje.result);
    };
    socket.onopen = () => {
      resolve({
        enviar(method, params = {}, sessionId) {
          const id = (siguienteId += 1);
          return new Promise((ok, ko) => {
            pendientes.set(id, { ok, ko });
            socket.send(JSON.stringify({ id, method, params, sessionId }));
          });
        },
        cerrar() {
          socket.close();
        }
      });
    };
  });
}

// ── Ensamblado ──────────────────────────────────────────────────────────────

const nombres = (await fs.readdir(ORIGEN))
  .filter((nombre) => nombre.endsWith(".md"))
  .sort((izquierda, derecha) => {
    // README primero; el resto por su prefijo numerico.
    if (izquierda === "README.md") return -1;
    if (derecha === "README.md") return 1;
    return izquierda.localeCompare(derecha);
  });

if (!nombres.length) {
  throw new Error("No hay documentos Markdown en docs/system-documentation/.");
}

const documentos = [];
for (const nombre of nombres) {
  const fuente = await fs.readFile(path.join(ORIGEN, nombre), "utf8");
  documentos.push({
    nombre,
    base: nombre.replace(/\.md$/, ""),
    titulo: tituloDe(fuente, nombre),
    indice: indiceDe(fuente),
    cuerpo: documentoHtml(fuente)
  });
}

const trabajo = await fs.mkdtemp(path.join(os.tmpdir(), "rootcause-system-docs-"));
const subtitulo =
  SISTEMA + " · version " + VERSION + " · documentacion generada el " + FECHA;

for (const documento of documentos) {
  const html = envolver(documento.titulo, documento.indice + documento.cuerpo, subtitulo);
  await fs.writeFile(path.join(trabajo, documento.base + ".html"), html, "utf8");
}

// Compendio: todos los documentos en un solo archivo, con salto de pagina entre
// ellos. Es lo que se imprime o se envia cuando alguien pide "la documentacion".
const compendio = envolver(
  "Documentacion del sistema",
  '<nav class="indice"><h2>Documentos incluidos</h2><ol>' +
    documentos
      .map((documento) => "<li>" + escapar(documento.titulo) + "</li>")
      .join("") +
    "</ol></nav>" +
    documentos
      .map((documento) => '<section class="documento">' + documento.cuerpo + "</section>")
      .join("\n"),
  subtitulo
);
await fs.writeFile(path.join(trabajo, "00-documentacion-completa.html"), compendio, "utf8");

const archivosHtml = [
  ...documentos.map((documento) => documento.base),
  "00-documentacion-completa"
];

if (SOLO_HTML) {
  await fs.mkdir(SALIDA_PDF, { recursive: true });
  for (const base of archivosHtml) {
    await fs.copyFile(
      path.join(trabajo, base + ".html"),
      path.join(SALIDA_PDF, base + ".html")
    );
  }
  await fs.rm(trabajo, { recursive: true, force: true });
  console.log(
    "HTML generado en docs/system-documentation/pdf/ (" + archivosHtml.length + " archivos)."
  );
  process.exit(0);
}

const navegador = localizarNavegador();
if (!navegador) {
  await fs.rm(trabajo, { recursive: true, force: true });
  throw new Error(
    "No se encontro Chrome ni Edge para imprimir los PDF.\n" +
      "Instala uno, indica la ruta en ROOTCAUSE_CHROME, o ejecuta con --html."
  );
}

await fs.mkdir(SALIDA_PDF, { recursive: true });

const perfil = await fs.mkdtemp(path.join(os.tmpdir(), "rootcause-docs-perfil-"));
const proceso = spawn(
  navegador,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--remote-debugging-port=0",
    "--user-data-dir=" + perfil,
    "about:blank"
  ],
  { stdio: ["ignore", "ignore", "ignore"] }
);

let sesion = null;
let generados = 0;
try {
  const { puerto, ruta } = await esperarPuerto(perfil);
  sesion = await abrirSesion("ws://127.0.0.1:" + puerto + ruta);

  async function imprimir(base) {
    const { targetId } = await sesion.enviar("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await sesion.enviar("Target.attachToTarget", {
      targetId,
      flatten: true
    });
    await sesion.enviar("Page.enable", {}, sessionId);
    await sesion.enviar(
      "Page.navigate",
      { url: pathToFileURL(path.join(trabajo, base + ".html")).href },
      sessionId
    );

    const limite = Date.now() + ESPERA_CARGA_MS;
    while (Date.now() < limite) {
      const { result } = await sesion.enviar(
        "Runtime.evaluate",
        { expression: 'document.readyState === "complete"', returnByValue: true },
        sessionId
      );
      if (result.value === true) break;
      await esperar(80);
    }

    const { data } = await sesion.enviar(
      "Page.printToPDF",
      {
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="width:100%;font-size:7pt;color:#8a94a3;padding:0 16mm;display:flex;justify-content:space-between;">' +
          "<span>" +
          SISTEMA +
          " · v" +
          VERSION +
          " · " +
          FECHA +
          "</span>" +
          '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
      },
      sessionId
    );
    await fs.writeFile(path.join(SALIDA_PDF, base + ".pdf"), Buffer.from(data, "base64"));
    await sesion.enviar("Target.closeTarget", { targetId });
    generados += 1;
  }

  for (const base of archivosHtml) {
    await imprimir(base);
    console.log("  " + base + ".pdf");
  }
} finally {
  if (sesion) sesion.cerrar();
  proceso.kill();
  await fs.rm(perfil, { recursive: true, force: true }).catch(() => {});
  await fs.rm(trabajo, { recursive: true, force: true }).catch(() => {});
}

console.log(
  "Documentacion del sistema generada: " +
    generados +
    " PDF en docs/system-documentation/pdf/."
);
