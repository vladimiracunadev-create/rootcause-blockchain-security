# Para reclutadores y revisores técnicos

Qué capacidades demuestra este repositorio, y dónde mirar para comprobarlo sin
leerlo entero.

**Ruta corta (10 minutos):**
[`ADR-0001`](ADR-0001-plataforma-y-lenguaje.md) →
`scripts/check-security-claims.js` → el job `app-windows` de
`.github/workflows/ci.yml`.

Esos tres archivos contienen casi todo lo que este proyecto quiere demostrar:
cómo se decide, cómo se verifica lo que se afirma, y cómo se comprueba que lo
entregado funciona de verdad.

## Qué es

Una consola de operador local y watch-only para aplicaciones blockchain:
inventaría contratos, proxies, oráculos, puentes, gobernanza y dependencias,
evalúa sus controles con un motor determinista y produce incidentes con causa
raíz, evidencia y runbook. Se distribuye como aplicación de escritorio para
Windows.

- ~2.900 líneas de JavaScript, **cero dependencias de terceros**
- 22 pruebas + 5 gates ejecutables + 6 jobs de CI
- Node.js 22, ESM, sin framework

## Capacidades que demuestra

### 1. Decidir con criterio y dejarlo por escrito

[`ADR-0001`](ADR-0001-plataforma-y-lenguaje.md) responde a dos preguntas
—dónde vive el producto y en qué lenguaje— con opciones descartadas
explícitamente y **cinco disparadores concretos** para migrar a Rust, de modo
que la decisión futura sea una comprobación y no una discusión.

Lo que más conviene mirar ahí: la sección sobre Go. El repositorio hermano lo
descarta rápido; aquí se argumenta que **en el dominio blockchain no se puede**
—geth y Cosmos SDK son Go— y se nombra el escenario que le daría la razón. Un
ADR que solo confirma la decisión ya tomada no vale nada.

### 2. Convertir claims en gates ejecutables

El problema real de un README de seguridad es que envejece mal. Aquí cada
afirmación tiene un script que la comprueba:

| Afirmación | Verificador |
|---|---|
| No acepta claves ni credenciales | `check-security-claims.js` — arranca el servidor real y le envía claves privadas, mnemónicos, keystores y URLs con credenciales; exige `422` en todas |
| Cero dependencias y cero orígenes remotos | `check-local-only.js` — más una segunda vía independiente en CI |
| Las reglas están documentadas donde deben | `check-rule-coverage.js` — motor, catálogo, política y README |
| Ningún documento miente sobre sus enlaces | `check-docs.js` |

### 3. Entregar software que arranca, no que compila

El job `app-windows` empaqueta la aplicación de escritorio, **ejecuta el `.cmd`
real que usa el usuario** y comprueba que el panel responde con inventario
dentro. El workflow de release va más allá: instala el `.exe` en silencio,
arranca la aplicación *instalada* y verifica lo mismo antes de publicar nada.

El comentario que resume la disciplina está en el propio workflow: *una
aplicación que abre vacía es el fallo que nadie detecta a tiempo.*

### 4. Cadena de suministro tratada en serio

- `node.exe` se descarga de nodejs.org y se **verifica por SHA-256** contra
  `SHASUMS256.txt` antes de entrar en el paquete; el hash queda dentro, en
  `BUILD-INFO.json`.
- Actions **pinneadas a commit SHA**, no a tag.
- Dependabot agrupado para que `codeql-action/init` y `analyze` nunca queden
  descoordinados.
- Cero `node_modules`, verificado por dos vías.
- Los releases publican `SHA256SUMS.txt`.

### 5. Criptografía aplicada correctamente

AES-256-GCM para el estado en disco, cadena de hashes SHA-256 para la
auditoría, escritura atómica. **Ninguna primitiva implementada a mano**: todo
sale de `node:crypto`. Saber qué no escribir es parte del trabajo.

### 6. Modelado de dominio

El motor no depende de ningún SDK de cadena: trabaja sobre hechos normalizados,
lo que permite añadir Solana o Cosmos sin tocar la lógica causal. La severidad
no es fija por regla, sino derivada de la criticidad del activo — el mismo
defecto pesa distinto según lo que proteja. Ver
[`HEURISTICAS.md`](HEURISTICAS.md).

### 7. Honestidad como requisito de producto

[`DETECCION_AMENAZAS.md`](DETECCION_AMENAZAS.md) enumera lo que **no** detecta:
reentrancy, manipulación económica, MEV, ataques de gobernanza. Y distingue tres
grados de «sí»: verificado contra la cadena, sobre hechos observados, y **sobre
lo que tú declaras** —incluyendo el caso incómodo: si declaras tres operadores
independientes que en realidad comparten cuenta de AWS, la regla te dará la
razón.

### 8. Frontend sin framework

Panel responsive con PWA, vistas direccionables por hash, diálogo accesible por
teclado, CSP `self` sin `unsafe-inline`. HTML, CSS y JS planos.

## Dónde mirar, por interés

| Si te interesa… | Mira |
|---|---|
| Criterio de arquitectura | [`ADR-0001`](ADR-0001-plataforma-y-lenguaje.md) |
| Seguridad aplicada | `src/domain/secret-guard.js`, `src/infrastructure/evm-rpc.js` |
| Ingeniería de release | `.github/workflows/release-windows.yml`, `packaging/windows/build-portable.ps1` |
| Modelado de dominio | `src/domain/rule-engine.js`, [`HEURISTICAS.md`](HEURISTICAS.md) |
| Comunicación técnica | [`BLOCKCHAIN-Y-BITCOIN.md`](BLOCKCHAIN-Y-BITCOIN.md) |
| Cómo se documenta | [`INDEX.md`](INDEX.md) |

## Contexto: la familia RootCause

Este repositorio es una de seis ediciones, repartidas en dos líneas y cuatro
lenguajes (Rust, JavaScript, Dart). La coherencia entre ellas —modelo de
incidente compartido, misma disciplina de entrega, misma honestidad sobre los
límites— es parte de lo que se demuestra. Ver
[`FAMILIA_ROOTCAUSE.md`](FAMILIA_ROOTCAUSE.md), que incluye también las
divergencias reales entre repositorios en vez de disimularlas.

## Lo que este repositorio no es

- No es un producto con usuarios en producción.
- No sustituye una auditoría de contratos.
- Los umbrales son ejemplos y están declarados como tales.
- Los binarios no están firmados con certificado de código.

Ese último apartado existe a propósito: un portafolio que solo enumera fortalezas
dice menos sobre el criterio de quien lo escribe que uno que sabe dónde están sus
límites.
