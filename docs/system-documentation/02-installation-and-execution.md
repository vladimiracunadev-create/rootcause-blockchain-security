# 02 · Instalación y ejecución

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

Este documento describe **cómo poner el sistema en marcha**, verificado contra
`package.json`, `.env.example`, `Dockerfile`, `compose.yaml` y los scripts de
`packaging/windows/`. La referencia de requisitos escrita por el proyecto está
en [`../REQUIREMENTS.md`](../REQUIREMENTS.md) y la de comandos en
[`../COMMANDS.md`](../COMMANDS.md).

---

## Requisitos previos

### Para ejecutar desde el código fuente

| Requisito | Versión | Evidencia | Obligatorio |
|---|---|---|---|
| Node.js | `>=22.12.0` | Campo `engines.node` de `package.json` | Sí |
| pnpm | `11.19.0` | Campo `packageManager` de `package.json` | Solo para invocar los scripts con `pnpm`; todo funciona igual con `node` directo |
| git | cualquiera | — | Solo para clonar |

**Hecho verificado** — no hay ningún paso de instalación de dependencias.
`pnpm install` no descarga nada porque no hay dependencias declaradas, y
`.github/workflows/ci.yml` documenta explícitamente que CI **no ejecuta**
`npm ci` ni `pnpm install`.

**Verificado en este análisis** con Node `v24.11.1`: las 144 pruebas pasan.
CI cubre además Node 22 y 24 sobre Windows, Ubuntu y macOS.

### Para usar la aplicación de escritorio ya empaquetada

Ninguno. **Hecho verificado** — la edición portable incluye el `node.exe`
oficial dentro del ZIP (`packaging/windows/build-portable.ps1` lo descarga y
verifica su SHA-256 contra el `SHASUMS256.txt` de nodejs.org). No requiere Node
instalado, ni permisos de administrador, ni conexión a Internet en tiempo de
ejecución.

### Para generar los PDF de la documentación o la presentación

Un **Chrome o Edge instalado** en el sistema. Se puede indicar una ruta concreta
con la variable `ROOTCAUSE_CHROME`. Ver
[13 · Despliegue y operación](13-deployment-and-operations.md).

### Para empaquetar la edición de Windows

- Windows con PowerShell.
- Conexión a Internet **durante la construcción** (para descargar el `node.exe`
  oficial). No en tiempo de ejecución.
- Inno Setup, solo si además se quiere generar el instalador
  (`packaging/windows/RootCause-Blockchain-Security.iss`).

---

## Instalación de dependencias

No aplica. Es una propiedad del producto, protegida por un gate:

~~~bash
node scripts/check-local-only.js
~~~

Si alguien añade una dependencia npm, un SDK de cadena, un CDN en el panel o
abre la Content-Security-Policy, ese comando falla y el build se detiene.

---

## Variables de entorno

Plantilla completa en `.env.example`. El detalle de cada valor, su rango, su
efecto y las consecuencias de configurarlo mal está en
[10 · Configuración](10-configuration.md).

| Variable | Valor por defecto | Efecto inmediato |
|---|---|---|
| `HOST` | `127.0.0.1` | Interfaz de escucha |
| `PORT` | `8790` | Puerto (0 pide uno efímero) |
| `DEMO_MODE` | `true` | `true` = estado en memoria con datos de demostración; `false` = estado cifrado en disco |
| `DATA_DIR` | `./data` | Carpeta del estado cifrado |
| `ROOTCAUSE_DATA_KEY` | *(vacío)* | Clave de 32 bytes. **Obligatoria si `DEMO_MODE=false`** |
| `REQUEST_BODY_LIMIT_BYTES` | `131072` | Tamaño máximo del cuerpo JSON |
| `RATE_LIMIT_PER_MINUTE` | `120` | Peticiones por minuto y por dirección de origen |
| `EVM_RPC_URL` | `http://127.0.0.1:8545` | Observador EVM opcional |
| `EVM_EXPECTED_CHAIN_ID` | `1` | Chain ID esperado; si no coincide se emite `BLK-NODE-002` |
| `EVM_ALLOW_REMOTE_RPC` | `false` | Permite un RPC no-loopback. **Cámbialo solo con criterio** |
| `EVM_RPC_TIMEOUT_MS` | `5000` | Tiempo máximo de una llamada RPC |
| `EVM_RPC_RESPONSE_LIMIT_BYTES` | `2097152` | Corta respuestas RPC desmesuradas |
| `WATCHTOWER_ENABLED` | `false` | Refresco y análisis periódicos |
| `WATCHTOWER_INTERVAL_MS` | `15000` | Intervalo del watchtower (mín. 5000) |
| `ROOTCAUSE_OPEN_BROWSER` | `0` | Solo el lanzador de escritorio lo pone a `1` |

**Nunca** pongas una clave real en un archivo versionado. `.gitignore` excluye
`.env`, y `scripts/validate-repo.js` falla si detecta material privado
incrustado en cualquier archivo de texto del repositorio.

---

## Configuración inicial

### Modo demostración (por defecto, sin configurar nada)

No requiere ningún paso. `DEMO_MODE=true` hace que `buildRuntime` use
`MemoryStore` con el estado de `createDemoState()`, y además precargue seis
datasets de inteligencia y ejecute un análisis, para que la consola no arranque
vacía.

**Hecho verificado** — `src/server.js`, líneas 35-71.

### Modo persistente (datos propios, cifrados en disco)

~~~bash
node scripts/generate-key.js
~~~

Ese comando imprime en `stdout` una línea `ROOTCAUSE_DATA_KEY=<32 bytes en
base64>` y en `stderr` el aviso de que hay que guardarla en un gestor de
secretos. Copia el valor a tu `.env` (o al entorno del proceso) y arranca con
`DEMO_MODE=false`.

Si arrancas con `DEMO_MODE=false` **sin** clave, la aplicación se niega a
arrancar con un mensaje explícito:

> `ROOTCAUSE_DATA_KEY is required when DEMO_MODE=false. Run pnpm generate:data-key.`

**Hecho verificado** — `assertProductionConfig` en `src/config.js`.

**Advertencia de operación.** No existe recuperación de la clave. Si se pierde,
el archivo `data/state.enc.json` es irrecuperable: AES-256-GCM sin clave no se
descifra. Ver [07 · Persistencia](07-database.md).

---

## Creación o restauración de la base de datos

**No hay base de datos.** El sistema persiste su estado completo en **un único
archivo JSON cifrado**. El detalle está en
[07 · Persistencia y modelo de almacenamiento](07-database.md) y la decisión
está razonada en [`../ADR-0002-almacenamiento-inteligencia.md`](../ADR-0002-almacenamiento-inteligencia.md).

Para sembrar un estado inicial cifrado a partir de los datos de demostración:

~~~bash
node scripts/seed-demo.js
~~~

Ese script **se niega a sobrescribir** un estado existente: comprueba
`fs.access(config.dataFile)` y sale con código 1 si el archivo ya está ahí.
**Hecho verificado** — `scripts/seed-demo.js`.

---

## Ejecución en desarrollo

~~~bash
node --watch src/server.js
~~~

Equivalente con pnpm: `pnpm dev`. Reinicia el proceso al guardar un archivo.

Al arrancar, el proceso emite una línea JSON en `stdout`:

~~~text
{"level":"info","event":"server_started","address":"http://127.0.0.1:8790","mode":"demo","watchtower":false,"browserOpened":false}
~~~

Abre `http://127.0.0.1:8790` en el navegador.

---

## Ejecución en producción

### Escritorio (uso previsto)

~~~bash
node src/server.js
~~~

Equivalente con pnpm: `pnpm start`. Con `DEMO_MODE=false` y
`ROOTCAUSE_DATA_KEY` definida.

El proceso instala manejadores de `SIGINT` y `SIGTERM` que detienen el
watchtower y cierran el servidor antes de salir. **Hecho verificado** —
`startServer` en `src/server.js`.

### Contenedor

~~~bash
docker compose up --build
~~~

`compose.yaml` publica el puerto **solo en loopback**
(`127.0.0.1:8790:8790`), monta el sistema de archivos como `read_only`, añade
`no-new-privileges:true` y hace `cap_drop: ALL`. Arranca en `DEMO_MODE=true`.

**Requiere validación** — el contenedor tal cual está definido corre en modo
demostración y con el sistema de archivos de solo lectura, así que **no puede
persistir estado**. Usarlo con datos reales exigiría montar un volumen para
`DATA_DIR` y pasar la clave por un mecanismo de secretos; el repositorio no
documenta ese despliegue.

### Aplicación de Windows empaquetada

Descomprimir el ZIP y ejecutar `RootCause Blockchain Security.cmd`. El lanzador
pone `ROOTCAUSE_OPEN_BROWSER=1`, lo que hace que el proceso abra el navegador
—y **solo** si el bind es loopback, comprobado en `openBrowserIfRequested`—.

---

## Compilación y empaquetado

~~~bash
powershell -ExecutionPolicy Bypass -File packaging/windows/make-icon.ps1
powershell -ExecutionPolicy Bypass -File packaging/windows/build-portable.ps1
~~~

Equivalente con pnpm: `pnpm package:windows`.

Para una construcción reproducible, fija la versión exacta del runtime:

~~~bash
powershell -File packaging/windows/build-portable.ps1 -NodeVersion 22.21.1
~~~

El empaquetador produce en `build/`:

- la carpeta ensamblada `build/portable/RootCause-Blockchain-Security/`;
- un ZIP `RootCause-Blockchain-Security-<versión>-win-x64-portable.zip`;
- su archivo `.sha256` con la huella del ZIP.

**Hecho verificado** — en el árbol de trabajo analizado existen los ZIP de las
versiones `0.2.0` y `0.3.0` con sus `.sha256`. `build/` está en `.gitignore`:
son artefactos, no fuentes.

---

## Ejecución de pruebas

| Comando | Qué cubre |
|---|---|
| `node --test` | Las 144 pruebas unitarias y de integración |
| `node scripts/validate-repo.js` | Archivos obligatorios, JSON válido, sintaxis de todos los `.js`, material privado incrustado, pruebas enfocadas |
| `node scripts/check-local-only.js` | Cero dependencias, cero orígenes remotos, CSP intacta |
| `node scripts/check-security-claims.js` | 51 invariantes, arrancando la aplicación real |
| `node scripts/check-rule-coverage.js` | Coherencia entre motor, catálogo, política y README |
| `node scripts/check-docs.js` | Todos los enlaces internos de la documentación existen |

Todo junto:

~~~bash
pnpm check
~~~

**Resultados obtenidos el 27 de agosto de 2026** (commit `6d96e71`, Node 24.11.1):

| Comando | Resultado |
|---|---|
| `node --test` | 144 pruebas, 144 pasan, 0 fallan (9,2 s) |
| `node scripts/validate-repo.js` | `Repository validation passed for 153 files.` |
| `node scripts/check-local-only.js` | `Claim solo-local verificado: cero dependencias, cero orígenes remotos, cero proveedores alojados.` |
| `node scripts/check-security-claims.js` | `Invariantes de seguridad verificados: 51 comprobaciones.` |
| `node scripts/check-rule-coverage.js` | 22 códigos `BLK-*` en 13 controles; 15 códigos `INT-*` en 6 familias |
| `node scripts/check-docs.js` | `Documentación coherente: 373 referencias verificadas en 37 documentos.` |

---

## Errores frecuentes durante la instalación

La guía completa está en [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) y en
[14 · Solución de problemas](14-troubleshooting.md). Los tres de instalación:

| Síntoma | Causa | Solución |
|---|---|---|
| `ROOTCAUSE_DATA_KEY is required when DEMO_MODE=false` | Modo persistente sin clave | `node scripts/generate-key.js` y exportar el valor |
| `EADDRINUSE` al arrancar | El puerto 8790 está ocupado | `PORT=8791 node src/server.js`, o `PORT=0` para uno efímero |
| Corepack no puede descargar pnpm | Sin red o proxy corporativo | Usa `node` directamente: ningún script del repositorio necesita pnpm |

---

## Ejemplos de comandos completos

Arranque en modo demostración, en un puerto distinto:

~~~bash
PORT=8791 node src/server.js
~~~

Arranque persistente con watchtower y observador local:

~~~bash
DEMO_MODE=false WATCHTOWER_ENABLED=true EVM_RPC_URL=http://127.0.0.1:8545 node src/server.js
~~~

*(La clave `ROOTCAUSE_DATA_KEY` debe estar en el entorno; no se escribe en la
línea de comandos para que no quede en el historial del intérprete.)*

Comprobación de salud desde otra terminal:

~~~bash
curl -s http://127.0.0.1:8790/api/health
~~~

Registrar el proyecto de ejemplo (toda mutación exige la cabecera local):

~~~bash
curl -s -X POST http://127.0.0.1:8790/api/projects -H "content-type: application/json" -H "x-rootcause-request: 1" --data-binary @examples/project.sample.json
~~~

---

## Documentos relacionados

- [10 · Configuración](10-configuration.md) — cada variable en detalle
- [13 · Despliegue y operación](13-deployment-and-operations.md)
- [14 · Solución de problemas](14-troubleshooting.md)
- [`../COMMANDS.md`](../COMMANDS.md) — referencia de comandos del proyecto
- [`../WINDOWS-APP.md`](../WINDOWS-APP.md) — la edición de escritorio en detalle
<!-- navegacion -->
---

**[← 01 · Descripción general del sistema](01-system-overview.md)** · **[Índice](README.md)** · **[03 · Arquitectura →](03-architecture.md)**
