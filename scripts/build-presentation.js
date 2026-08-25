// Compila docs/presentacion.md en los dos documentos de la muestra del producto:
//
//   presentacion/presentacion.html → diapositivas 16:9 (proyectar / PRESENTACION.pdf)
//   presentacion/pauta.html        → pauta del expositor (guion + tiempos / PAUTA.pdf)
//
// La fuente es UNA sola: cada sección "## N · Título" de docs/presentacion.md es
// una diapositiva; su cuerpo es lo que se proyecta y la cita final
// (> **Pauta · N min.**) es lo que dice quien expone. Mantener las dos cosas en
// el mismo archivo evita el problema clásico de las presentaciones: el guion y
// las láminas se separan a la segunda edición y acaban contando cosas distintas.
//
// Dentro de esa cita, la pauta se parte en dos secciones obligatorias, como el
// libreto de un programa de televisión:
//
//   ### Guion         → lo que se pronuncia, palabra por palabra
//   ### Indicaciones  → lo que se hace (abrir, señalar, recortar); NO se dice
//
// Van separadas porque se leen de forma distinta: el guion se lee en voz alta y
// las indicaciones se miran de reojo. Mezcladas en el mismo párrafo, quien expone
// acaba leyendo en voz alta una instrucción de escena.
//
// Las secciones "## Anexo · Título" son la otra mitad del oficio de exponer —la
// comprobación previa, los recortes por duración, las preguntas de la sala y las
// líneas que no se cruzan—. NO se proyectan: se imprimen al final de la pauta.
//
// Tres decisiones propias de este repositorio:
//
//   1. Cero dependencias, también aquí. El Markdown lo convierte
//      scripts/lib/markdown.js y el PDF lo imprime un Chrome del sistema por el
//      protocolo DevTools (scripts/render-presentation-pdf.js). Una dependencia
//      de construcción también es una dependencia.
//
//   2. Ningún número se escribe a mano. Los marcadores {{...}} de la fuente se
//      rellenan contando los archivos del repositorio, ejecutando las pruebas y
//      —en la lámina de la demo— EJECUTANDO los comandos y quedándose con su
//      última línea. Una lámina de un producto de seguridad con una cifra
//      obsoleta proyectada a pantalla completa es la peor manera de perder una
//      sala.
//
//   3. Las capturas viajan incrustadas como data URI. El HTML de las
//      diapositivas es un archivo único que se puede copiar a un pendrive y
//      abrir en cualquier equipo, y no pide nada a ningún origen externo, que es
//      la misma regla que cumple el panel.
//
// Uso: node scripts/build-presentation.js
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PROJECT_ROOT } from "../src/config.js";
import { renderMarkdown } from "./lib/markdown.js";

const SITIO = "https://vladimiracunadev-create.github.io/rootcause-blockchain-security";
const FUENTE = "docs/presentacion.md";
const SALIDA = "presentacion";
const MINIMO_LAMINAS = 6;

const leer = (relativo) => fs.readFile(path.join(PROJECT_ROOT, relativo), "utf8");
const esc = (texto) => String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function fallar(mensaje) {
  throw new Error(mensaje);
}

// ── Ejecutar de verdad lo que la lámina dice que imprime ────────────────────
//
// La alternativa —transcribir la salida a mano— produce el fallo más
// vergonzoso posible en una demo: proyectar una línea que el comando ya no
// imprime, delante de gente que sabe leer una terminal.
function ejecutar(argumentos, etiqueta) {
  const resultado = spawnSync(process.execPath, argumentos, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 120000
  });
  if (resultado.status !== 0) {
    fallar(
      "El comando de la demo falló (" +
        etiqueta +
        "): la presentación no se genera con una demo rota.\n" +
        (resultado.stderr || resultado.stdout || "").trim()
    );
  }
  const lineas = String(resultado.stdout).split("\n").map((linea) => linea.trim()).filter(Boolean);
  if (lineas.length === 0) fallar("El comando de la demo no imprimió nada (" + etiqueta + ").");
  return { ultima: lineas[lineas.length - 1], salida: resultado.stdout };
}

// ── Cifras contadas, nunca escritas ─────────────────────────────────────────
const manifiesto = JSON.parse(await leer("package.json"));
const version = manifiesto.version;
const dependencias = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundledDependencies"
].reduce((total, campo) => total + Object.keys(manifiesto[campo] || {}).length, 0);

const catalogo = JSON.parse(await leer("config/control-catalog.json"));
const controles = (catalogo.controls || []).length;

const motor = (await leer("src/domain/rule-engine.js")) + "\n" + (await leer("src/domain/wallet-rules.js"));
const detecciones = new Set([...motor.matchAll(/code:\s*"(BLK-[A-Z]+-\d{3})"/g)].map((m) => m[1])).size;

const catalogoIndicadores = await leer("src/domain/intelligence/indicators.js");
const indicadores = new Set([...catalogoIndicadores.matchAll(/\bINT-[A-Z]+-\d{3}\b/g)].map((m) => m[0])).size;

const escenarios = (await fs.readdir(path.join(PROJECT_ROOT, "examples", "datasets"))).filter((archivo) =>
  archivo.endsWith(".json")
).length;

if (!controles || !detecciones || !indicadores || !escenarios) {
  fallar("No se pudieron contar los controles, las detecciones, los indicadores o los escenarios.");
}

// La suite completa, no un grep: el número de pruebas que anuncia la lámina es
// el que node imprime al terminar de ejecutarlas.
const suite = spawnSync(process.execPath, ["--test"], { cwd: PROJECT_ROOT, encoding: "utf8", timeout: 300000 });
const pasadas = /^\s*(?:ℹ\s*)?pass\s+(\d+)\s*$/m.exec(suite.stdout || "");
if (suite.status !== 0 || !pasadas) {
  fallar("La suite de pruebas no terminó en verde: la presentación no anuncia una cifra que no se cumple.");
}
const pruebas = Number(pasadas[1]);

// Los dos comandos de la lámina 7, ejecutados de verdad.
const demoLocal = ejecutar(["scripts/check-local-only.js"], "pnpm check:local-only");
const demoSeguridad = ejecutar(["scripts/check-security-claims.js"], "pnpm check:security");
const invariantesDeclarados = /verificados:\s*(\d+)\s*comprobaciones/.exec(demoSeguridad.ultima);
if (!invariantesDeclarados) {
  fallar(
    "check-security-claims.js ya no imprime cuántos invariantes verificó.\n" +
      "Última línea recibida: " +
      demoSeguridad.ultima
  );
}
const invariantes = Number(invariantesDeclarados[1]);

// ── Leer la fuente y separarla en diapositivas y anexos ─────────────────────
const fuente = await leer(FUENTE);
const laminas = [];
const anexos = [];
let laminaActual = null;
let anexoActual = null;

for (const linea of fuente.split("\n")) {
  const encabezado = /^##\s+(\d+)\s*·\s*(.+?)\s*$/.exec(linea);
  if (encabezado) {
    anexoActual = null;
    laminaActual = { n: Number(encabezado[1]), titulo: encabezado[2], cuerpo: [], pauta: [] };
    laminas.push(laminaActual);
    continue;
  }
  // "## Anexo · Título": material del expositor. Va a la pauta, nunca a la pantalla.
  const cabeceraAnexo = /^##\s+Anexo\s*·\s*(.+?)\s*$/.exec(linea);
  if (cabeceraAnexo) {
    laminaActual = null;
    anexoActual = { titulo: cabeceraAnexo[1], cuerpo: [] };
    anexos.push(anexoActual);
    continue;
  }
  // Cualquier otro "## " cierra la sección en curso: las secciones de
  // introducción del documento (sin número) no son láminas.
  if (/^##\s/.test(linea)) {
    laminaActual = null;
    anexoActual = null;
    continue;
  }
  if (anexoActual) {
    anexoActual.cuerpo.push(linea);
    continue;
  }
  if (!laminaActual) continue;
  // Una cita que empieza por "**Pauta · N min.**" abre el libreto; todo lo que
  // venga después es del expositor. Las citas ANTERIORES son contenido de la
  // lámina: el recuadro de remate que cierra varias de ellas. Sin esta
  // distinción —la regla ingenua "toda línea citada es pauta"— ese recuadro
  // desaparece de la pantalla sin que nada se queje, que es la peor clase de
  // fallo en un generador de documentos.
  if (!laminaActual.enPauta && /^>\s*\*\*Pauta\s*·/.test(linea)) laminaActual.enPauta = true;
  if (laminaActual.enPauta) {
    // La regla horizontal que separa la última lámina de los anexos es puntuación
    // del documento, no contenido de nadie.
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(linea)) continue;
    if (linea.trim() && !/^>/.test(linea)) {
      fallar(
        "La diapositiva " + laminaActual.n + " (" + laminaActual.titulo + ") tiene contenido " +
          "después de la pauta:\n  " + linea.trim() + "\nTodo lo que sigue a la pauta va citado con «>»."
      );
    }
    laminaActual.pauta.push(linea.replace(/^>\s?/, ""));
    continue;
  }
  laminaActual.cuerpo.push(linea);
}

if (laminas.length < MINIMO_LAMINAS) {
  fallar(FUENTE + " solo define " + laminas.length + " diapositivas: se esperaban al menos " + MINIMO_LAMINAS + ".");
}
if (!anexos.length) {
  fallar(FUENTE + ' no define ningún anexo ("## Anexo · Título") para la pauta.');
}
for (const anexo of anexos) {
  if (!anexo.cuerpo.join("").trim()) fallar('El anexo "' + anexo.titulo + '" está vacío.');
}
laminas.forEach((lamina, indice) => {
  if (lamina.n !== indice + 1) {
    fallar("Diapositivas mal numeradas: la " + (indice + 1) + ".ª declara " + lamina.n + ".");
  }
  if (!lamina.pauta.length) {
    fallar("La diapositiva " + lamina.n + " (" + lamina.titulo + ") no tiene pauta del expositor.");
  }
});

// Minutos declarados en cada pauta: la duración total se calcula, no se escribe
// a mano, para que no envejezca al añadir una lámina.
for (const lamina of laminas) {
  const texto = lamina.pauta.join("\n").trim();
  const minutos = /\*\*Pauta\s*·\s*(\d+)\s*min\.?\*\*/.exec(texto);
  if (!minutos) {
    fallar('La diapositiva ' + lamina.n + ' no declara los minutos: usa "> **Pauta · N min.** …".');
  }
  lamina.minutos = Number(minutos[1]);
  const cuerpoPauta = texto.replace(/\*\*Pauta\s*·\s*\d+\s*min\.?\*\*\s*/, "");

  // Guion e indicaciones son DOS COSAS DISTINTAS y se componen distinto.
  // Mezclar "di esta frase" con "abre el panel en otra pestaña" en el mismo
  // párrafo es lo que hace que quien expone se pierda: el ojo no distingue lo
  // que hay que pronunciar de lo que hay que hacer.
  const partes = /###\s+Guion\s*\n([\s\S]*?)\n###\s+Indicaciones\s*\n([\s\S]*)$/.exec(cuerpoPauta);
  if (!partes) {
    fallar(
      "La diapositiva " + lamina.n + " (" + lamina.titulo + ") no separa el guion de las indicaciones.\n" +
        'Usa dentro de la pauta: "### Guion" (lo que se dice, palabra por palabra) y ' +
        '"### Indicaciones" (lo que se hace; no se pronuncia).'
    );
  }
  lamina.guion = partes[1].trim();
  lamina.indicaciones = partes[2].trim();
  if (!lamina.guion) fallar("La diapositiva " + lamina.n + " tiene el guion vacío.");
  if (!lamina.indicaciones) fallar("La diapositiva " + lamina.n + " no tiene indicaciones.");
}

const duracion = laminas.reduce((total, lamina) => total + lamina.minutos, 0);

// ── Sustitución de los marcadores ───────────────────────────────────────────
const VALORES = {
  version,
  dependencias: String(dependencias),
  controles: String(controles),
  detecciones: String(detecciones),
  indicadores: String(indicadores),
  escenarios: String(escenarios),
  pruebas: String(pruebas),
  invariantes: String(invariantes),
  laminas: String(laminas.length),
  duracion: String(duracion),
  "demo-local-only": demoLocal.ultima,
  "demo-security": demoSeguridad.ultima
};

const usados = new Set();

function resolver(texto) {
  return String(texto).replace(/\{\{([a-z0-9-]+)\}\}/gi, (_, clave) => {
    if (!(clave in VALORES)) {
      fallar(
        "El documento usa el marcador {{" + clave + "}}, que este compilador no sabe rellenar.\n" +
          "Marcadores disponibles: " + Object.keys(VALORES).join(", ")
      );
    }
    usados.add(clave);
    return VALORES[clave];
  });
}

for (const lamina of laminas) {
  lamina.cuerpoTexto = resolver(lamina.cuerpo.join("\n").trim());
  lamina.guion = resolver(lamina.guion);
  lamina.indicaciones = resolver(lamina.indicaciones);
}
for (const anexo of anexos) {
  anexo.cuerpoTexto = resolver(anexo.cuerpo.join("\n").trim());
}

// ── Capturas incrustadas ────────────────────────────────────────────────────
const TIPOS = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };
const cacheImagenes = new Map();

async function incrustar(html) {
  const referencias = [...html.matchAll(/<img src="([^"]+)"/g)].map((coincidencia) => coincidencia[1]);
  for (const referencia of new Set(referencias)) {
    if (/^(?:https?:|data:)/.test(referencia)) {
      fallar("La presentación referencia una imagen externa: " + referencia + " (deben ser locales).");
    }
    if (!cacheImagenes.has(referencia)) {
      const absoluta = path.resolve(path.join(PROJECT_ROOT, path.dirname(FUENTE)), referencia);
      const tipo = TIPOS[path.extname(referencia).toLowerCase()];
      if (!tipo) fallar("Tipo de imagen no soportado en la presentación: " + referencia);
      let datos;
      try {
        datos = await fs.readFile(absoluta);
      } catch {
        fallar("La presentación referencia una captura que no existe: " + referencia);
      }
      cacheImagenes.set(referencia, "data:" + tipo + ";base64," + datos.toString("base64"));
    }
    html = html.split('<img src="' + referencia + '"').join('<img src="' + cacheImagenes.get(referencia) + '"');
  }
  return html;
}

// El primer párrafo en negrita de cada lámina es su frase de entrada: se compone
// distinto (más grande, en color de acento) que el resto del cuerpo.
async function cuerpoHtml(lamina) {
  const html = renderMarkdown(lamina.cuerpoTexto).replace(
    /^<p><strong>([\s\S]*?)<\/strong><\/p>/,
    '<p class="lead">$1</p>'
  );
  return incrustar(html);
}

// Una captura del producto ocupa media lámina o no se ve. Se saca del flujo de
// texto y se compone en su propia columna: la alternativa —imagen debajo del
// texto en un 16:9— deja la captura del tamaño de un sello.
function separarFigura(html) {
  const figuras = [];
  const texto = html.replace(/<p>(<img [^>]*>)<\/p>/g, (_, imagen) => {
    figuras.push(imagen);
    return "";
  });
  return { texto: texto.trim(), figuras };
}

function densidad(html) {
  const filas = (html.match(/<tr>/g) || []).length;
  const puntos = (html.match(/<li>/g) || []).length;
  return filas >= 7 || puntos >= 7 ? " densa" : "";
}

// Cada párrafo del guion es una intervención numerada: leyendo en voz alta y
// levantando la vista cada pocas frases, el número es lo que permite volver al
// sitio exacto. Un bloque de prosa corrida, no.
//
// Un párrafo enteramente en negrita ("**Demo A · …**") no es una intervención:
// es un rótulo que separa dos ramas del guion. No se numera ni se pronuncia, o
// la numeración dejaría de contar lo que hay que decir.
function guionHtml(texto) {
  let numero = 0;
  return texto
    .split(/\n{2,}/)
    .map((parrafo) => parrafo.trim().replace(/\s*\n\s*/g, " "))
    .filter(Boolean)
    .map((parrafo) => {
      const rotulo = /^\*\*([\s\S]+)\*\*$/.exec(parrafo);
      if (rotulo && !rotulo[1].includes("**")) {
        return '<p class="rotulo">' + renderMarkdown(rotulo[1]).replace(/^<p>|<\/p>$/g, "") + "</p>";
      }
      numero += 1;
      return (
        '<p class="linea"><span class="n">' +
        numero +
        "</span>" +
        renderMarkdown(parrafo).replace(/^<p>|<\/p>$/g, "") +
        "</p>"
      );
    })
    .join("\n");
}

// ── Diapositivas (16:9) ─────────────────────────────────────────────────────
//
// Tema oscuro, y no por moda: es la paleta del panel y de la página de
// producto, y una lámina clara proyectada junto a una captura de fondo oscuro
// deja la captura flotando en un recuadro blanco. La pauta, que se imprime, va
// en claro.
const CSS_DIAPOSITIVAS = `
  :root {
    --fondo:#080c18; --fondo-2:#10172a; --borde:rgba(153,171,214,.20); --borde-s:rgba(153,171,214,.34);
    --acento:#7c5cff; --acento-c:#b3a2ff; --teal:#2bd8c5; --txt:#f4f6ff; --txt-sec:#95a1bd;
    --mono:'Cascadia Code','Fira Code',Consolas,ui-monospace,monospace;
    --sans:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;
  }
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; background:#05070f; }
  body { font-family:var(--sans); color:var(--txt); }
  .slide {
    width:1280px; height:720px; background:var(--fondo); position:relative; overflow:hidden;
    page-break-after:always; break-after:page; margin:0 auto 24px; padding:44px 66px 88px;
    display:flex; flex-direction:column;
  }
  .slide:last-child { page-break-after:auto; break-after:auto; margin-bottom:0; }
  .slide::before { content:""; position:absolute; inset:0 0 auto 0; height:8px;
                   background:linear-gradient(90deg,var(--acento),var(--teal)); }
  .tope { display:flex; justify-content:space-between; align-items:center; font-size:18px;
          color:var(--txt-sec); letter-spacing:.03em; }
  .tope .marca { font-weight:600; }
  .tope .pag { font-variant-numeric:tabular-nums; font-family:var(--mono); }
  h2 { font-size:50px; line-height:1.1; margin:22px 0 0; letter-spacing:-.02em; }
  h2::after { content:""; display:block; width:96px; height:6px; border-radius:4px;
              background:linear-gradient(90deg,var(--acento),var(--teal)); margin-top:16px; }
  /* min-height:0 es lo que hace que la zona NO crezca con su contenido: sin eso,
     un flex item se estira para caber y el ajuste de escala nunca se dispara. */
  .zona { flex:1; min-height:0; overflow:hidden; display:flex; align-items:flex-start; margin-top:22px; }
  /* flex:0 0 auto para que el ancho compensado del ajuste de escala no lo
     encoja el propio contenedor flexible. */
  .contenido { width:100%; flex:0 0 auto; transform-origin:top left; }
  .con-figura { display:flex; gap:32px; align-items:flex-start; }
  .con-figura .texto { flex:1 1 52%; min-width:0; }
  .con-figura .figuras { flex:0 0 44%; }
  .figuras img { width:100%; display:block; border-radius:10px; border:1px solid var(--borde-s);
                 box-shadow:0 14px 38px rgba(0,0,0,.55); margin-bottom:14px; }
  .lead { font-size:31px; line-height:1.3; font-weight:700; color:var(--acento-c); margin:0 0 20px; }
  .contenido p { font-size:26px; line-height:1.4; margin:0 0 16px; }
  .contenido ul, .contenido ol { font-size:27px; line-height:1.4; margin:0; padding-left:1.15em; }
  .contenido li { margin-bottom:13px; }
  .contenido li::marker { color:var(--teal); }
  .contenido strong { color:#fff; }
  .contenido em { color:var(--acento-c); font-style:normal; }
  .contenido code { font-family:var(--mono); font-size:.85em; background:rgba(124,92,255,.16);
                    color:#c9bcff; padding:.1em .34em; border-radius:5px; }
  .contenido blockquote { margin:18px 0 0; padding:14px 22px; border-left:6px solid var(--teal);
                          background:rgba(43,216,197,.08); border-radius:0 10px 10px 0; }
  .contenido blockquote p { font-size:23px; margin:0; color:#dfe6ff; }
  .contenido table { border-collapse:collapse; width:100%; font-size:23px; }
  .contenido th, .contenido td { border-bottom:1px solid var(--borde); padding:10px 14px; text-align:left; }
  .contenido th { background:rgba(124,92,255,.14); font-size:19px; text-transform:uppercase;
                  letter-spacing:.05em; color:var(--txt-sec); }
  .contenido tbody tr:last-child td { border-bottom:none; }
  .contenido table + ul, .contenido table + ol, .contenido table + p { margin-top:20px; }
  .contenido.densa .lead { font-size:28px; margin-bottom:14px; }
  .contenido.densa ul, .contenido.densa ol { font-size:24px; }
  .contenido.densa li { margin-bottom:9px; }
  .contenido.densa table { font-size:21px; }
  .contenido.densa th, .contenido.densa td { padding:7px 12px; }
  .contenido.densa th { font-size:17px; }
  .pie { position:absolute; left:66px; right:66px; bottom:24px; display:flex; justify-content:space-between;
         gap:24px; font-size:13px; color:var(--txt-sec); border-top:1px solid var(--borde); padding-top:11px;
         font-family:var(--mono); white-space:nowrap; }
  .slide.portada { background:radial-gradient(120% 130% at 12% 0%,#1d1442 0%,#0c1226 46%,#05070f 100%); }
  .slide.portada h2 { font-size:64px; margin-top:86px; }
  /* La portada no escala su contenido, así que su zona no puede tener alto cero:
     con flex:0 se quedaría en 0 px y overflow:hidden se comería la lámina entera. */
  .slide.portada .zona { flex:0 0 auto; overflow:visible; margin-top:30px; }
  .slide.portada .lead { font-size:33px; color:var(--teal); }
  @page { size:1280px 720px; margin:0; }
  @media print { body { background:var(--fondo); } .slide { margin:0; } }
`;

// Ajuste de escala: una lámina que se pasa de alto se encoge en bloque en vez de
// desbordar (y de perder la última línea al imprimir). Se hace en el navegador,
// que es el único que sabe cuánto ocupa el texto de verdad, y después de `load`,
// que es cuando las capturas incrustadas ya tienen su altura definitiva.
const AJUSTE = `
<script>
window.addEventListener("load", function () {
  document.querySelectorAll(".slide").forEach(function (slide) {
    var zona = slide.querySelector(".zona");
    var caja = slide.querySelector(".contenido");
    if (!zona || !caja) return;
    var disponible = zona.clientHeight - 2;
    if (disponible <= 0) return;
    var base = caja.scrollHeight;
    if (base <= disponible) return; // cabe tal cual: no se toca

    function aplicar(e) {
      caja.style.transform = e < 1 ? "scale(" + e + ")" : "";
      caja.style.width = (100 / e) + "%";
    }
    // Primera escala, calculada al ancho original: siempre cabe, porque al
    // compensar el ancho el texto envuelve MENOS y el bloque solo puede encoger.
    var segura = Math.max(0.6, disponible / base);
    aplicar(segura);
    // Y como al ensanchar suele sobrar sitio, se busca por bisección la letra
    // más grande que sigue cabiendo: cada intento se mide, no se estima.
    var alta = 1;
    for (var i = 0; i < 6 && alta - segura > 0.012; i++) {
      var media = (segura + alta) / 2;
      aplicar(media);
      if (caja.scrollHeight * media <= disponible) segura = media;
      else alta = media;
    }
    aplicar(segura);
  });
  window.__deckReady = true;
});
</script>`;

const bloquesLamina = [];
for (const lamina of laminas) {
  const html = await cuerpoHtml(lamina);
  const { texto, figuras } = separarFigura(html);
  lamina.htmlCompleto = html;
  const contenido = figuras.length
    ? '<div class="texto">' + texto + '</div><div class="figuras">' + figuras.join("\n") + "</div>"
    : texto;
  const clases = "contenido" + (figuras.length ? " con-figura" : "") + densidad(texto);
  bloquesLamina.push(
    '\n<section class="slide' + (lamina.n === 1 ? " portada" : "") + '">\n' +
      '  <div class="tope"><span class="marca">' +
      (lamina.n === 1 ? "🎤 Muestra del producto" : "⛓️ RootCause Blockchain Security") +
      '</span><span class="pag">' +
      lamina.n +
      " / " +
      laminas.length +
      "</span></div>\n" +
      "  <h2>" + esc(lamina.titulo) + "</h2>\n" +
      '  <div class="zona"><div class="' + clases + '">' + contenido + "</div></div>\n" +
      '  <div class="pie"><span>v' + version + " · " + controles + " controles · " + detecciones +
      " detecciones · " + indicadores + " indicadores · " + dependencias + " dependencias</span><span>" +
      SITIO.replace("https://", "") + "</span></div>\n" +
      "</section>"
  );
}

const diapositivas =
  '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=1280">\n' +
  "<title>RootCause Blockchain Security · Presentación del producto</title>\n" +
  "<style>" + CSS_DIAPOSITIVAS + "</style>\n</head>\n<body>\n" +
  bloquesLamina.join("\n") + "\n" + AJUSTE + "\n</body>\n</html>\n";

// ── Pauta del expositor (A4) ────────────────────────────────────────────────
const CSS_PAUTA = `
  :root { --tinta:#141420; --suave:#5b5b73; --acento:#7c5cff; --teal:#149c8c; --linea:#ddd9f2; }
  * { box-sizing:border-box; }
  body { font-family:"Segoe UI","Liberation Sans",system-ui,-apple-system,Arial,sans-serif;
         color:var(--tinta); margin:0; font-size:13.5pt; line-height:1.5; }
  .portada { text-align:center; padding:64px 0 36px; border-bottom:4px solid var(--acento); margin-bottom:24px; }
  .portada .escudo { font-size:58pt; line-height:1; }
  .portada h1 { font-size:29pt; margin:12px 0 6px; letter-spacing:-.02em; }
  .portada p { font-size:13.5pt; color:var(--suave); margin:5px 0; }
  .portada .meta { display:inline-flex; gap:12px; margin-top:16px; font-size:11.5pt; color:var(--suave); }
  .portada .meta span { border:2px solid var(--linea); border-radius:999px; padding:5px 15px; }
  h2 { font-size:18pt; margin:24px 0 10px; }
  h3 { font-size:15pt; margin:0 0 8px; }
  table { border-collapse:collapse; width:100%; font-size:12pt; margin:12px 0 20px; }
  th, td { border:1.5px solid var(--linea); padding:8px 11px; text-align:left; vertical-align:top; }
  th { background:#f6f4ff; color:var(--suave); text-transform:uppercase; font-size:10.5pt; letter-spacing:.04em; }
  .aviso { background:#f6f4ff; border-left:6px solid var(--acento); padding:14px 18px;
           border-radius:0 8px 8px 0; font-size:12.5pt; }
  /* Los bloques largos se dejan fluir. Con break-inside:avoid, un bloque más
     alto que la hoja empieza en una página nueva igualmente Y deja la anterior
     medio vacía: hojas de más en un documento que existe para imprimirse. Lo
     que sí se evita es que una cabecera quede huérfana al final de la página. */
  .lamina { border:2px solid var(--linea); border-radius:12px; padding:16px 20px; margin:0 0 18px; }
  .lamina .cab { display:flex; justify-content:space-between; align-items:baseline; gap:14px;
                 border-bottom:2px solid var(--linea); padding-bottom:9px; margin-bottom:12px;
                 page-break-after:avoid; break-after:avoid; }
  .lamina p, .anexo p, .lamina li, .anexo li { orphans:3; widows:3; }
  .lamina .num { font-size:12pt; color:#fff; background:var(--acento); border-radius:8px;
                 padding:3px 12px; font-weight:700; }
  .lamina .tiempo { font-size:11.5pt; color:var(--suave); white-space:nowrap; }
  .rot { font-size:10pt; text-transform:uppercase; letter-spacing:.07em; color:var(--suave);
         font-weight:700; margin:0 0 6px; }
  .rot .aparte { text-transform:none; letter-spacing:0; font-weight:400; font-size:9.5pt; }
  /* El rótulo del guion pesa más que los otros dos: en una hoja leída de reojo,
     el ojo tiene que caer en lo que hay que pronunciar, no en el contexto. */
  .rot.decir { font-size:11.5pt; color:var(--acento); }
  .pantalla { font-size:10.5pt; color:#4a4a60; background:#faf9ff; border-radius:8px; padding:9px 14px; }
  .pantalla ul, .pantalla ol { margin:0; padding-left:1.1em; }
  .pantalla li { margin-bottom:3px; }
  .pantalla p { margin:0 0 5px; }
  .pantalla blockquote { margin:6px 0 0; padding-left:10px; border-left:3px solid var(--linea); }
  .pantalla table { font-size:9.5pt; margin:5px 0 0; }
  .pantalla th, .pantalla td { padding:4px 7px; }
  .pantalla th { font-size:8.5pt; }
  /* La captura va de referencia, no de material: en la pauta solo tiene que
     bastar para saber qué lámina está proyectada. */
  .pantalla img { max-width:52%; height:auto; border:1px solid var(--linea); border-radius:6px; margin:6px 0 0; }
  /* Lo que se dice: cuerpo grande, línea holgada y una intervención por párrafo.
     Está pensado para leerse de pie y a un metro de distancia. */
  .guion { margin-top:6px; border-left:6px solid var(--acento); padding:4px 0 2px 16px; }
  .guion .linea { position:relative; padding-left:32px; margin:0 0 12px; font-size:13.5pt;
                  line-height:1.62; page-break-inside:avoid; break-inside:avoid; }
  .guion .rotulo { margin:14px 0 9px; font-size:10.5pt; text-transform:uppercase; letter-spacing:.06em;
                   color:var(--suave); font-weight:700; border-bottom:1.5px dashed var(--linea);
                   padding-bottom:5px; }
  .guion .rotulo:first-child { margin-top:0; }
  .guion .linea .n { position:absolute; left:0; top:3px; width:22px; height:22px; border-radius:50%;
                     background:#efecff; color:var(--acento); font-size:9.5pt; font-weight:700;
                     display:inline-flex; align-items:center; justify-content:center; }
  /* Lo que se hace: gris, pequeño y en viñetas. No se pronuncia nunca. */
  .indicaciones { background:#f2f1f7; border-radius:8px; padding:9px 16px; font-size:11pt; color:#494960; }
  .indicaciones ul { margin:0; padding-left:1.05em; }
  .indicaciones li { margin-bottom:5px; }
  .indicaciones li::marker { color:var(--suave); }
  .indicaciones p { margin:0 0 6px; }
  .anexo { border:2px solid var(--linea); border-left:8px solid var(--teal); border-radius:12px;
           padding:15px 20px 17px; margin:0 0 18px; }
  .anexo h3 { border-bottom:2px solid var(--linea); padding-bottom:9px; margin-bottom:10px;
              page-break-after:avoid; break-after:avoid; }
  .anexo tr, .lamina tr { page-break-inside:avoid; break-inside:avoid; }
  .anexo table { font-size:11pt; }
  .anexo th, .anexo td { padding:6px 9px; }
  .anexo li { margin-bottom:5px; }
  code { font-family:"Cascadia Mono",Consolas,monospace; font-size:.9em; background:#f2f0ff;
         color:#4a32c9; padding:.08em .3em; border-radius:4px; }
  @page { size:A4; margin:16mm 15mm; }
`;

const filasResumen = laminas
  .map(
    (lamina) =>
      '<tr><td style="text-align:right">' + lamina.n + "</td><td>" + esc(lamina.titulo) +
      '</td><td style="text-align:right">' + lamina.minutos + " min</td></tr>"
  )
  .join("\n");

const bloquesPauta = laminas
  .map(
    (lamina) =>
      '\n<div class="lamina">\n' +
      '  <div class="cab">\n' +
      '    <h3><span class="num">' + lamina.n + "</span> " + esc(lamina.titulo) + "</h3>\n" +
      '    <span class="tiempo">⏱ ' + lamina.minutos + " min</span>\n" +
      "  </div>\n" +
      '  <p class="rot">En pantalla <span class="aparte">— lo que ve la sala</span></p>\n' +
      '  <div class="pantalla">' + lamina.htmlCompleto + "</div>\n" +
      '  <p class="rot decir" style="margin-top:14px">🎙 Lo que dices <span class="aparte">— léelo tal cual</span></p>\n' +
      '  <div class="guion">' + guionHtml(lamina.guion) + "</div>\n" +
      '  <p class="rot" style="margin-top:14px">🎬 Lo que haces <span class="aparte">— no se dice en voz alta</span></p>\n' +
      '  <div class="indicaciones">' + renderMarkdown(lamina.indicaciones) + "</div>\n" +
      "</div>"
  )
  .join("\n");

const bloquesAnexo = anexos
  .map(
    (anexo) =>
      '\n<section class="anexo">\n  <h3>' + esc(anexo.titulo) + "</h3>\n  " +
      renderMarkdown(anexo.cuerpoTexto) + "\n</section>"
  )
  .join("\n");

const pauta =
  '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
  "<title>RootCause Blockchain Security · Pauta del expositor</title>\n" +
  "<style>" + CSS_PAUTA + "</style>\n</head>\n<body>\n" +
  '<div class="portada">\n' +
  '  <div class="escudo">⛓️</div>\n' +
  "  <h1>Pauta del expositor</h1>\n" +
  "  <p><strong>RootCause Blockchain Security</strong> · muestra del producto</p>\n" +
  "  <p>" + controles + " controles · " + detecciones + " detecciones · " + indicadores +
  " indicadores · watch-only y sin claves</p>\n" +
  '  <div class="meta"><span>v' + version + "</span><span>" + laminas.length +
  " diapositivas</span><span>≈ " + duracion + " min</span><span>" + anexos.length +
  " anexos</span></div>\n" +
  "</div>\n\n" +
  '<div class="aviso">\n' +
  "  <strong>Cómo se usa.</strong> Proyecta <code>PRESENTACION.pdf</code> a pantalla completa y ten\n" +
  "  esta pauta impresa o en un segundo monitor. Cada diapositiva trae <strong>tres bloques\n" +
  "  separados a propósito</strong>, y no se leen igual:\n" +
  '  <ul style="margin:8px 0 0;padding-left:1.1em">\n' +
  "    <li><strong>En pantalla</strong> — lo que ve la sala. Es contexto: no se lee.</li>\n" +
  "    <li><strong>🎙 Lo que dices</strong> — el guion, palabra por palabra, en intervenciones\n" +
  "        numeradas. <strong>Esto se pronuncia tal cual está escrito.</strong> Si te pierdes, el\n" +
  "        número te devuelve al sitio exacto.</li>\n" +
  "    <li><strong>🎬 Lo que haces</strong> — las acotaciones: qué abrir, dónde detenerte, qué\n" +
  "        recortar. <strong>Nada de esto se dice en voz alta.</strong></li>\n" +
  "  </ul>\n" +
  '  <p style="margin:10px 0 0">Los tiempos suman ' + duracion + " minutos sobre " + laminas.length +
  " láminas, así que la charla entera cabe en una franja de tres cuartos de hora dejando margen\n" +
  "  para preguntas. <strong>Si expones hoy, empieza por el primer anexo</strong>: es la\n" +
  "  comprobación de los diez minutos previos. Y si el hueco que tienes no son " + duracion +
  " minutos, el anexo siguiente dice exactamente qué proyectar y qué sacrificar.</p>\n" +
  "</div>\n\n" +
  "<h2>Guion en un vistazo</h2>\n" +
  "<table>\n" +
  '  <thead><tr><th style="width:8%">#</th><th>Diapositiva</th><th style="width:16%">Tiempo</th></tr></thead>\n' +
  "  <tbody>\n" + filasResumen + "\n" +
  '    <tr><th colspan="2" style="text-align:right">Total</th><th style="text-align:right">' +
  duracion + " min</th></tr>\n" +
  "  </tbody>\n</table>\n\n" +
  "<h2>Diapositiva a diapositiva</h2>\n" + bloquesPauta + "\n\n" +
  "<h2>Anexos: lo que no se proyecta</h2>\n" + bloquesAnexo + "\n\n" +
  '<p style="margin-top:26px;font-size:11pt;color:#5b5b73;border-top:2px solid #ddd9f2;padding-top:12px">\n' +
  "Generado desde <code>docs/presentacion.md</code> · v" + version + " · " +
  SITIO.replace("https://", "") + " · Licencia MIT · Sin telemetría\n</p>\n</body>\n</html>\n";

// ── Escribir ────────────────────────────────────────────────────────────────
const sinUsar = Object.keys(VALORES).filter((clave) => !usados.has(clave));
await fs.mkdir(path.join(PROJECT_ROOT, SALIDA), { recursive: true });
await fs.writeFile(path.join(PROJECT_ROOT, SALIDA, "presentacion.html"), diapositivas, "utf8");
await fs.writeFile(path.join(PROJECT_ROOT, SALIDA, "pauta.html"), pauta, "utf8");

console.log(
  SALIDA + "/presentacion.html: " + laminas.length + " diapositivas (v" + version + " · " +
    controles + " controles · " + detecciones + " detecciones · " + indicadores + " indicadores · " +
    pruebas + " pruebas · " + invariantes + " invariantes)."
);
console.log(
  SALIDA + "/pauta.html: pauta del expositor, ≈" + duracion + " min y " + anexos.length + " anexos."
);
if (sinUsar.length) {
  console.log("Marcadores disponibles que la fuente no usa: " + sinUsar.join(", ") + ".");
}
