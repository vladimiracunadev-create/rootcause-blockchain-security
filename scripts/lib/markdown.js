// Renderizador Markdown mínimo, escrito a mano.
//
// No es un capricho: `scripts/check-local-only.js` prohíbe cualquier import que
// no sea `node:` o una ruta relativa de este repositorio, y esa regla no admite
// excepciones «solo para las herramientas». Una dependencia de construcción es
// una dependencia: entra en el árbol, se actualiza sola y acaba siendo la vía
// por la que un repositorio que promete cero dependencias deja de cumplirlo.
//
// Cubre exactamente lo que usa docs/presentacion.md —encabezados, párrafos,
// listas, tablas, citas, bloques de código, negrita, cursiva, código en línea,
// enlaces e imágenes— y nada más. Si una lámina necesita algo que este archivo
// no entiende, la respuesta correcta es simplificar la lámina.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

// Marca interna para apartar el código en línea mientras se aplica el resto del
// marcado. Es un punto de código de uso privado: no aparece en texto real, y a
// diferencia del carácter nulo sí se puede volver a buscar con una expresión
// regular construida desde una cadena.
const MARCA = String.fromCharCode(0xe000);
const DEVOLVER_CODIGO = new RegExp(MARCA + "([0-9]+)" + MARCA, "g");

function escaparHtml(texto) {
  return String(texto).replace(/[&<>]/g, (caracter) => ESCAPES[caracter]);
}

function sangria(linea) {
  return /^\s*/.exec(linea)[0].length;
}

function esItem(linea) {
  return /^\s*(?:[-*+]|\d+\.)\s+\S/.test(linea);
}

function esSeparadorDeTabla(linea) {
  return Boolean(linea) && /^[\s|:-]+$/.test(linea) && linea.includes("-") && linea.includes("|");
}

function celdas(linea) {
  const partes = linea.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  return partes.map((celda) => celda.trim());
}

/**
 * Marcado en línea: negrita, cursiva, código, enlaces e imágenes.
 *
 * El código en línea se aparta antes de aplicar el resto de reglas y se
 * devuelve al final: sin eso, un asterisco doble dentro de un comando se
 * convertiría en negrita y la lámina proyectaría algo que no se puede copiar.
 */
export function renderInline(texto) {
  const codigos = [];
  let salida = escaparHtml(texto).replace(/`([^`]+)`/g, (_, codigo) => {
    codigos.push(codigo);
    return MARCA + (codigos.length - 1) + MARCA;
  });

  salida = salida
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

  return salida.replace(DEVOLVER_CODIGO, (_, indice) => "<code>" + codigos[Number(indice)] + "</code>");
}

function renderLista(lineasLista) {
  const base = sangria(lineasLista[0]);
  const ordenada = /^\s*\d+\.\s/.test(lineasLista[0]);
  const items = [];

  for (const linea of lineasLista) {
    const item = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(linea);
    if (item && sangria(linea) === base) items.push({ texto: item[1], resto: [] });
    else if (items.length) items[items.length - 1].resto.push(linea.slice(base + 2));
  }

  const cuerpo = items
    .map((item) => {
      const resto = item.resto.filter((linea) => linea.trim());
      const anidada = resto.some((linea) => esItem(linea));
      // Una línea suelta debajo de un punto es la continuación de su frase; una
      // línea con viñeta es una sublista. Distinguirlas evita el fallo clásico:
      // media frase colgando fuera del punto al que pertenece.
      const texto = anidada ? item.texto : [item.texto, ...resto.map((linea) => linea.trim())].join(" ");
      const dentro = anidada ? renderLista(resto) : "";
      return "<li>" + renderInline(texto) + dentro + "</li>";
    })
    .join("\n");

  return ordenada ? "<ol>\n" + cuerpo + "\n</ol>" : "<ul>\n" + cuerpo + "\n</ul>";
}

/** Convierte un fragmento de Markdown en HTML. */
export function renderMarkdown(fuente) {
  const lineas = String(fuente).replace(/\r\n/g, "\n").split("\n");
  const bloques = [];
  let indice = 0;

  while (indice < lineas.length) {
    const linea = lineas[indice];

    if (!linea.trim()) {
      indice += 1;
      continue;
    }

    if (/^\s*(?:```|~~~)/.test(linea)) {
      const valla = /^\s*(```|~~~)/.exec(linea)[1];
      const contenido = [];
      indice += 1;
      while (indice < lineas.length && !lineas[indice].trim().startsWith(valla)) {
        contenido.push(lineas[indice]);
        indice += 1;
      }
      indice += 1;
      bloques.push("<pre><code>" + escaparHtml(contenido.join("\n")) + "</code></pre>");
      continue;
    }

    const encabezado = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (encabezado) {
      const nivel = encabezado[1].length;
      bloques.push("<h" + nivel + ">" + renderInline(encabezado[2].trim()) + "</h" + nivel + ">");
      indice += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(linea)) {
      bloques.push("<hr>");
      indice += 1;
      continue;
    }

    if (linea.includes("|") && esSeparadorDeTabla(lineas[indice + 1])) {
      const cabecera = celdas(linea);
      indice += 2;
      const filas = [];
      while (indice < lineas.length && lineas[indice].includes("|") && lineas[indice].trim()) {
        filas.push(celdas(lineas[indice]));
        indice += 1;
      }
      const th = cabecera.map((celda) => "<th>" + renderInline(celda) + "</th>").join("");
      const tr = filas
        .map((fila) => "<tr>" + fila.map((celda) => "<td>" + renderInline(celda) + "</td>").join("") + "</tr>")
        .join("\n");
      bloques.push("<table>\n<thead><tr>" + th + "</tr></thead>\n<tbody>\n" + tr + "\n</tbody>\n</table>");
      continue;
    }

    if (esItem(linea)) {
      const bloque = [];
      while (
        indice < lineas.length &&
        lineas[indice].trim() &&
        (esItem(lineas[indice]) || sangria(lineas[indice]) > sangria(linea))
      ) {
        bloque.push(lineas[indice]);
        indice += 1;
      }
      bloques.push(renderLista(bloque));
      continue;
    }

    if (/^\s*>/.test(linea)) {
      const bloque = [];
      while (indice < lineas.length && /^\s*>/.test(lineas[indice])) {
        bloque.push(lineas[indice].replace(/^\s*>\s?/, ""));
        indice += 1;
      }
      bloques.push("<blockquote>\n" + renderMarkdown(bloque.join("\n")) + "\n</blockquote>");
      continue;
    }

    const parrafo = [];
    while (
      indice < lineas.length &&
      lineas[indice].trim() &&
      !esItem(lineas[indice]) &&
      !/^\s*>/.test(lineas[indice]) &&
      !/^#{1,6}\s/.test(lineas[indice]) &&
      !/^\s*(?:```|~~~)/.test(lineas[indice]) &&
      !esSeparadorDeTabla(lineas[indice + 1])
    ) {
      parrafo.push(lineas[indice].trim());
      indice += 1;
    }
    // Si el bucle no consumió nada, esta línea abre una tabla (se detecta por la
    // siguiente): se deja para la próxima vuelta en vez de perderla.
    if (parrafo.length === 0) {
      parrafo.push(lineas[indice].trim());
      indice += 1;
    }
    bloques.push("<p>" + renderInline(parrafo.join(" ")) + "</p>");
  }

  return bloques.join("\n");
}
