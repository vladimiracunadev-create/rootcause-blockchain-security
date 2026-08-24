# Problemas comunes

## La aplicación no arranca

### La ventana de consola se abre y se cierra al instante

Ejecuta el lanzador desde una consola para ver el error:

~~~powershell
cd "$env:LOCALAPPDATA\Programs\RootCause Blockchain Security"
.\"RootCause Blockchain Security.cmd"
~~~

La causa habitual es la siguiente.

### «DEMO_MODE=false requiere una clave de datos»

Pusiste `DEMO_MODE=false` sin `ROOTCAUSE_DATA_KEY`. Es deliberado: la aplicación
prefiere no arrancar antes que guardar tu inventario sin cifrar.

1. Ejecuta **Generar clave de datos**.
2. Añade a `%LOCALAPPDATA%\RootCause\blockchain-security\config.cmd`:

   ~~~bat
   set "ROOTCAUSE_DATA_KEY=el-valor-generado"
   ~~~

### El puerto 8790 está ocupado

En `config.cmd`:

~~~bat
set "PORT=8791"
~~~

Para comprobar quién lo tiene:

~~~powershell
Get-NetTCPConnection -LocalPort 8790 | Select-Object OwningProcess
~~~

### SmartScreen bloquea el instalador

Los binarios no están firmados con certificado de código. La verificación
disponible hoy es el hash publicado:

~~~powershell
Get-FileHash .\RootCause-Blockchain-Security-0.2.0-win-x64-setup.exe -Algorithm SHA256
~~~

Compara con `SHA256SUMS.txt` del release. Si coincide, el archivo es exactamente
el que se construyó en CI.

## El panel se abre pero está vacío

### No hay proyectos

En modo persistente el inventario empieza vacío: eres tú quien lo registra. Para
recorrer el producto con datos, arranca en modo demostración
(`DEMO_MODE=true`).

### La aplicación instalada arranca sin nada

Esto **no debería ocurrir**: CI y el workflow de release comprueban
explícitamente que la aplicación instalada sirve inventario antes de publicar.
Si te pasa, es un fallo del empaquetado y merece un issue con la versión y el
`BUILD-INFO.json` que está en la carpeta del programa.

## El observador no conecta

### BLK-NODE-001 — Observador RPC no disponible

Comprueba que el nodo responde:

~~~bash
curl -s -X POST http://127.0.0.1:8545 -H "content-type: application/json" --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_blockNumber\",\"params\":[]}"
~~~

Si eso falla, el problema está en el nodo, no en RootCause.

### «Remote EVM RPC is disabled»

Tu `EVM_RPC_URL` no apunta a localhost. Es el comportamiento por defecto y es
intencionado. Para permitirlo:

~~~bat
set "EVM_ALLOW_REMOTE_RPC=true"
~~~

Antes de hacerlo: **el proveedor remoto verá qué contratos consultas.**

### «Credentials embedded in EVM_RPC_URL are rejected»

Tu URL lleva usuario y contraseña incrustados. La aplicación no los acepta
porque acabarían en logs y en el estado. Usa un proxy local autenticado o un
túnel.

### BLK-NODE-002 — chain ID equivocado

El nodo responde, pero es **otra cadena**. Ajusta `EVM_EXPECTED_CHAIN_ID` al
valor real, o corrige el endpoint. No lo ignores: todo lo que veas será cierto y
a la vez irrelevante.

### BLK-NODE-003 — Observador atrasado

Tu nodo va por detrás de la cabeza de cadena más de lo que permite
`maximumObserverLagBlocks`. Suele ser sincronización en curso o disco saturado.

## La API rechaza mis peticiones

### 403 MUTATION_HEADER_REQUIRED

Falta la cabecera en una petición que modifica estado:

~~~text
x-rootcause-request: 1
~~~

### 403 CROSS_SITE_REQUEST_REJECTED

La petición llegó con `sec-fetch-site` distinto de `same-origin`. Es la
protección contra que una web cualquiera hable con tu panel local.

### 422 SECRET_MATERIAL_REJECTED

Enviaste algo que parece material secreto: una clave privada, un mnemónico, un
keystore, un token de proveedor o una URL con credenciales. **La aplicación no
lo acepta por diseño.** Revisa el payload y quita ese campo — no hay forma de
desactivarlo, y esa es la idea.

### 415 o 413

Falta `content-type: application/json`, o el cuerpo supera
`REQUEST_BODY_LIMIT_BYTES`.

### 429 RATE_LIMITED

Más de `RATE_LIMIT_PER_MINUTE` peticiones en un minuto desde el mismo origen.

## Problemas de desarrollo

### Corepack no puede descargar pnpm

Usa Node directamente; pnpm no es necesario para nada esencial:

~~~bash
node src/server.js
node --test
node scripts/validate-repo.js
~~~

### `pnpm check` falla en `check:security`

El script arranca un servidor real. Si un proceso anterior quedó colgado:

~~~powershell
Get-Process node | Stop-Process -Force
~~~

### `check:docs` falla tras renombrar un documento

Es su trabajo. Busca las referencias viejas:

~~~bash
grep -rn "NOMBRE_VIEJO" --include="*.md" .
~~~

### `check:rules` falla tras tocar el motor

Una regla nueva toca cuatro sitios: `src/domain/rule-engine.js`,
`config/control-catalog.json`, `config/policies.json` y `README.md`. El error te
dice exactamente cuál falta.

### El empaquetado falla al comprimir

~~~text
node.exe todavia bloqueado; reintento 1 de 5
~~~

Es normal: tras el arranque de verificación, Windows o el antivirus pueden
mantener `node.exe` bloqueado unos segundos. El script reintenta cinco veces. Si
agota los cinco, cierra procesos `node` colgados y repite.

## Dónde reportar

Los problemas de seguridad **no** van a un issue público: ver
[`../SECURITY.md`](../SECURITY.md). Todo lo demás, a los issues del repositorio,
con versión, `BUILD-INFO.json` y los pasos mínimos para reproducir.
