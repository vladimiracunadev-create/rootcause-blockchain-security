// Convierte los dos HTML de la muestra en PDF:
//
//   presentacion/presentacion.html → presentacion/PRESENTACION.pdf  (16:9, una lámina por página)
//   presentacion/pauta.html        → presentacion/PAUTA.pdf         (A4, guion del expositor)
//
// Sin puppeteer y sin ninguna otra dependencia: se lanza un Chrome o un Edge ya
// instalado en el sistema y se le habla por el protocolo DevTools con el
// WebSocket que trae Node. Es exactamente la misma decisión que toma el
// observador EVM al hablar JSON-RPC a mano en vez de traerse un SDK, y por la
// misma razón: un repositorio que promete cero dependencias no puede hacer una
// excepción "solo para las herramientas".
//
// Se usa el protocolo en vez del atajo `--print-to-pdf` por dos cosas que ese
// atajo no sabe hacer y que este documento necesita:
//
//   · esperar a que el ajuste de escala de las láminas termine, para no imprimir
//     una diapositiva con la última línea cortada;
//   · poner pie de página con numeración en la pauta, que es un documento que se
//     imprime, se deja en un atril y se puede desordenar.
//
// Uso: node scripts/render-presentation-pdf.js
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { PROJECT_ROOT } from "../src/config.js";

const SALIDA = path.join(PROJECT_ROOT, "presentacion");
const ESPERA_ARRANQUE_MS = 20000;
const ESPERA_CARGA_MS = 60000;

function localizarNavegador() {
  // Una ruta indicada a mano que no existe se avisa aquí: si se dejara pasar, el
  // fallo aparecería mucho más tarde y disfrazado de "el navegador no publicó su
  // puerto de depuración".
  if (process.env.ROOTCAUSE_CHROME) {
    if (!fsSync.existsSync(process.env.ROOTCAUSE_CHROME)) {
      throw new Error("ROOTCAUSE_CHROME apunta a un ejecutable que no existe: " + process.env.ROOTCAUSE_CHROME);
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

// El puerto se pide efímero (`--remote-debugging-port=0`) para no chocar con un
// navegador que el operador ya tenga depurando. Chrome escribe el que le tocó en
// DevToolsActivePort, dentro del perfil temporal.
async function esperarPuerto(perfil) {
  const limite = Date.now() + ESPERA_ARRANQUE_MS;
  while (Date.now() < limite) {
    try {
      const crudo = await fs.readFile(path.join(perfil, "DevToolsActivePort"), "utf8");
      const [puerto, ruta] = crudo.split("\n");
      if (puerto && ruta && ruta.trim()) return { puerto: Number(puerto), ruta: ruta.trim() };
    } catch {
      // Todavía no existe: el navegador sigue arrancando.
    }
    await esperar(100);
  }
  throw new Error("El navegador no publicó su puerto de depuración en " + ESPERA_ARRANQUE_MS / 1000 + " s.");
}

function abrirSesion(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pendientes = new Map();
    let siguienteId = 0;

    socket.onerror = () => reject(new Error("No se pudo hablar con el navegador por el protocolo DevTools."));
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

const documentos = ["presentacion.html", "pauta.html"];
for (const documento of documentos) {
  if (!fsSync.existsSync(path.join(SALIDA, documento))) {
    throw new Error(
      "Falta presentacion/" + documento + ". Ejecuta antes: node scripts/build-presentation.js"
    );
  }
}

const navegador = localizarNavegador();
if (!navegador) {
  throw new Error(
    "No se encontró Chrome ni Edge para imprimir los PDF.\n" +
      "Instala uno, o indica la ruta del ejecutable en la variable ROOTCAUSE_CHROME."
  );
}

const perfil = await fs.mkdtemp(path.join(os.tmpdir(), "rootcause-presentacion-"));
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
try {
  const { puerto, ruta } = await esperarPuerto(perfil);
  sesion = await abrirSesion("ws://127.0.0.1:" + puerto + ruta);

  async function imprimir(documento, salida, opciones, esperarAjuste) {
    const { targetId } = await sesion.enviar("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await sesion.enviar("Target.attachToTarget", { targetId, flatten: true });
    await sesion.enviar("Page.enable", {}, sessionId);
    await sesion.enviar("Page.navigate", { url: pathToFileURL(path.join(SALIDA, documento)).href }, sessionId);

    const limite = Date.now() + ESPERA_CARGA_MS;
    while (Date.now() < limite) {
      const expresion = esperarAjuste
        ? "window.__deckReady === true"
        : 'document.readyState === "complete"';
      const { result } = await sesion.enviar(
        "Runtime.evaluate",
        { expression: expresion, returnByValue: true },
        sessionId
      );
      if (result.value === true) break;
      await esperar(120);
    }

    const { data } = await sesion.enviar("Page.printToPDF", opciones, sessionId);
    await fs.writeFile(path.join(SALIDA, salida), Buffer.from(data, "base64"));
    const { result } = await sesion.enviar(
      "Runtime.evaluate",
      { expression: "document.querySelectorAll('.slide').length", returnByValue: true },
      sessionId
    );
    await sesion.enviar("Target.closeTarget", { targetId });
    return result.value;
  }

  // Diapositivas: el tamaño de página lo manda el CSS (@page 1280×720 px), sin
  // márgenes y sin cabecera. `preferCSSPageSize` es lo que hace que una lámina
  // 16:9 no acabe recortada en una hoja Carta.
  const proyectadas = await imprimir(
    "presentacion.html",
    "PRESENTACION.pdf",
    { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
    true
  );
  console.log("presentacion/PRESENTACION.pdf generado (" + proyectadas + " diapositivas).");

  // Pauta: A4 con numeración. No se recorta a las páginas esperadas a propósito
  // —eso escondería justo el fallo que busca check-presentation.js—.
  await imprimir(
    "pauta.html",
    "PAUTA.pdf",
    {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#888;padding:0 15mm;display:flex;justify-content:space-between;">' +
        "<span>RootCause Blockchain Security — Pauta del expositor</span>" +
        '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
    },
    false
  );
  console.log("presentacion/PAUTA.pdf generado.");
} finally {
  if (sesion) sesion.cerrar();
  proceso.kill();
  await fs.rm(perfil, { recursive: true, force: true }).catch(() => {});
}
