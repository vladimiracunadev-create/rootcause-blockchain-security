# Referencia de comandos

Todo lo que se puede ejecutar en este repositorio, con lo que hace y lo que
verifica.

## Scripts del repositorio

| Comando | Qué hace |
|---|---|
| `pnpm start` | Arranca el servidor en `127.0.0.1:8790`. Modo demo por defecto. |
| `pnpm dev` | Igual, con recarga al cambiar un archivo (`node --watch`). |
| `pnpm test` | Pruebas unitarias y de integración (`node --test`). |
| `pnpm lint` | Validación estructural del repositorio. |
| `pnpm check` | **Las seis puertas encadenadas.** Lo que se ejecuta antes de abrir un cambio. |
| `pnpm check:local-only` | Cero dependencias, cero orígenes remotos, cero proveedores alojados, CSP self-only. |
| `pnpm check:security` | Arranca la aplicación real y verifica los seis principios con peticiones hostiles. |
| `pnpm check:rules` | Motor, catálogo, política y README describen el mismo conjunto de reglas. |
| `pnpm check:docs` | Ningún documento enlaza a un archivo inexistente. |
| `pnpm build:presentacion` | Genera las diapositivas y la pauta del expositor desde `docs/presentacion.md`, y los imprime en PDF. |
| `pnpm check:presentacion` | La presentación publicada tiene las láminas, los minutos y los anexos que anuncia el README. |
| `pnpm generate:data-key` | Genera una clave AES-256 para la persistencia cifrada. |
| `pnpm seed:demo` | Vuelca el estado de demostración. |
| `pnpm package:windows` | Genera el icono y empaqueta la edición portable. |

Sin Corepack o sin red, los equivalentes directos:

~~~bash
node src/server.js
node --test
node scripts/validate-repo.js
node scripts/check-local-only.js
node scripts/check-security-claims.js
node scripts/check-rule-coverage.js
node scripts/check-docs.js
~~~

## Variables de entorno

| Variable | Por defecto | Efecto |
|---|---|---|
| `HOST` | `127.0.0.1` | Interfaz de escucha. Cambiarlo expone el panel. |
| `PORT` | `8790` | Puerto del panel. |
| `DEMO_MODE` | `true` | `false` activa la persistencia cifrada. |
| `DATA_DIR` | `./data` | Dónde vive el estado cifrado. |
| `ROOTCAUSE_DATA_KEY` | — | **Obligatoria** con `DEMO_MODE=false`. |
| `REQUEST_BODY_LIMIT_BYTES` | `131072` | Tamaño máximo de petición. |
| `RATE_LIMIT_PER_MINUTE` | `120` | Peticiones por minuto y origen. |
| `EVM_RPC_URL` | `http://127.0.0.1:8545` | Endpoint del observador. |
| `EVM_EXPECTED_CHAIN_ID` | `1` | Chain ID esperado. Un valor distinto dispara `BLK-NODE-002`. |
| `EVM_ALLOW_REMOTE_RPC` | `false` | Permite endpoints no locales. Ver la advertencia de abajo. |
| `EVM_RPC_TIMEOUT_MS` | `5000` | Timeout por llamada RPC. |
| `EVM_RPC_RESPONSE_LIMIT_BYTES` | `2097152` | Tamaño máximo de respuesta RPC. |
| `WATCHTOWER_ENABLED` | `false` | Sondeo periódico del observador. |
| `WATCHTOWER_INTERVAL_MS` | `15000` | Cada cuánto sondea. |
| `ROOTCAUSE_OPEN_BROWSER` | `0` | Solo el lanzador de escritorio lo pone a `1`. |

> `EVM_ALLOW_REMOTE_RPC=true` saca a la aplicación de su postura por defecto: el
> proveedor remoto pasa a ver qué contratos consultas. Es una decisión
> consciente, no un ajuste de conveniencia.

## API HTTP

Todas las rutas viven bajo `http://127.0.0.1:8790`. Las mutaciones exigen la
cabecera `x-rootcause-request: 1` y rechazan peticiones cross-site.

### Lectura

~~~bash
curl http://127.0.0.1:8790/api/health
curl http://127.0.0.1:8790/api/summary
curl http://127.0.0.1:8790/api/projects
curl http://127.0.0.1:8790/api/incidents
curl http://127.0.0.1:8790/api/policies
curl http://127.0.0.1:8790/api/controls
curl http://127.0.0.1:8790/api/audit
~~~

### Ejecutar un análisis

~~~bash
curl -X POST http://127.0.0.1:8790/api/scan \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data "{}"
~~~

### Registrar un proyecto

~~~bash
curl -X POST http://127.0.0.1:8790/api/projects \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data @examples/project.sample.json
~~~

### Enviar un hecho observado

~~~bash
curl -X POST http://127.0.0.1:8790/api/observe/event \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data @examples/event.privileged-change.json
~~~

### Reconocer un incidente

~~~bash
curl -X PATCH http://127.0.0.1:8790/api/incidents/<id> \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data '{"status":"acknowledged"}'
~~~

### Inteligencia on-chain (API v1)

Ingerir un escenario reproducible, analizarlo y consultar el riesgo de una
dirección con su explicación completa:

~~~bash
curl -X POST http://127.0.0.1:8790/api/v1/intelligence/ingest/dataset \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data '{"datasetId":"08-drainer-simulado"}'
~~~

~~~bash
curl -X POST http://127.0.0.1:8790/api/v1/intelligence/analyze \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data '{}'
~~~

~~~bash
curl "http://127.0.0.1:8790/api/v1/risk/addresses/ethereum/0xc8c8000000000000000000000000000000000000"
~~~

Seguir el movimiento de fondos, siempre acotado:

~~~bash
curl "http://127.0.0.1:8790/api/v1/intelligence/graph/ethereum/0xc8c8000000000000000000000000000000000000?direction=both&depth=3"
~~~

El flujo completo del analista —abrir un caso, adjuntar evidencia, generar el
informe y cerrar por falso positivo— está en
[`INVESTIGATION-GUIDE.md`](INVESTIGATION-GUIDE.md).

Contrato completo en [`API.md`](API.md) y
[`openapi-intelligence.yaml`](openapi-intelligence.yaml).

## Empaquetado de Windows

~~~powershell
# Icono multirresolución, generado desde código
powershell -File packaging/windows/make-icon.ps1

# Portable: descarga node.exe, verifica su SHA-256, ensambla y comprime
powershell -File packaging/windows/build-portable.ps1

# Runtime fijo, para una compilación reproducible
powershell -File packaging/windows/build-portable.ps1 -NodeVersion 22.23.2

# Instalador (reutiliza la carpeta ensamblada por el paso anterior)
iscc /DAppVersion=0.3.0 packaging/windows/RootCause-Blockchain-Security.iss
~~~

## Docker

~~~bash
docker compose up --build
~~~

Modo self-hosted. Es el camino soportado para vigilancia continua, ya que el
watchtower de escritorio solo corre mientras el panel está abierto.

## Publicar una versión

~~~bash
# 1. subir la versión en package.json y CHANGELOG.md
# 2. crear y empujar el tag
git tag v0.3.0
git push origin v0.3.0
~~~

El workflow rechaza el tag si no coincide con `package.json`. Checklist completo
en [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

## GitHub CLI

~~~bash
# Estado de los workflows
gh run list --limit 10

# Ver por qué falló uno
gh run view <id> --log-failed

# Artefactos de un release
gh release view v0.3.0 --json assets

# Verificar una descarga
gh release download v0.3.0 --pattern "SHA256SUMS.txt"
~~~

## Verificar una descarga

~~~powershell
Get-FileHash .\RootCause-Blockchain-Security-0.3.0-win-x64-setup.exe -Algorithm SHA256
~~~

Compara el resultado con la línea correspondiente de `SHA256SUMS.txt`.
