# 09 · APIs e integraciones

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

El contrato HTTP escrito por el proyecto está en [`../API.md`](../API.md), y la
especificación formal de la API de riesgo en
[`../openapi-intelligence.yaml`](../openapi-intelligence.yaml). Este documento
añade la vista de auditoría: postura común, garantías, límites, errores y qué
integraciones existen de verdad.

---

## Postura común de la API

**Hecho verificado** — se aplica a **todas** las respuestas, incluidas las de
error.

| Propiedad | Valor |
|---|---|
| Base | `http://127.0.0.1:8790` por defecto |
| Formato | JSON en petición y respuesta |
| Autenticación | **Ninguna.** El control es el bind loopback |
| Cabecera obligatoria en mutaciones | `x-rootcause-request: 1` |
| Cabecera opcional de trazabilidad | `x-rootcause-actor` |
| Content-Type exigido con cuerpo | `application/json` |
| Cuerpo máximo | 128 KB (configurable 1 KB – 1 MB) |
| Límite de ritmo | 120 peticiones/minuto por origen (configurable 10 – 10 000) |
| Caché | `cache-control: no-store` en toda respuesta JSON |
| Identificador de petición | `x-request-id` con un UUID |
| CORS | **No hay cabeceras CORS.** Ningún origen externo puede leer las respuestas |
| Tiempos del servidor | `requestTimeout` 15 s, `headersTimeout` 10 s, `keepAliveTimeout` 5 s |

### Forma del error

~~~json
{ "error": { "code": "SECRET_MATERIAL_REJECTED", "message": "Forbidden secret field rejected at request.privateKey" } }
~~~

En los 5xx el `message` se sustituye por «The request could not be completed.» y
el detalle real queda en el registro local. El catálogo completo de códigos está
en [05 · Referencia técnica](05-technical-reference.md#códigos-de-error).

---

## API de defensa · `/api/*`

Quince rutas. No está versionada: es la API interna del panel.

### Lectura

| Método y ruta | Devuelve |
|---|---|
| `GET /api/health` | `{status, service, version, time}` |
| `GET /api/summary` | Riesgo, totales, `walletPosture`, cuentas, proyectos, 30 incidentes, nodo, verificación de auditoría |
| `GET /api/projects` | `{projects}` |
| `GET /api/accounts` | `{accounts}` |
| `GET /api/incidents` | `{incidents}` — todos, incluidos los resueltos |
| `GET /api/policies` | `{policies}` — política efectiva cargada |
| `GET /api/controls` | Catálogo de los 13 controles |
| `GET /api/audit` | `{verification, entries}` |

`GET /api/summary` recorta a **30 incidentes**. Para la lista completa hay que
usar `/api/incidents`; es un detalle fácil de pasar por alto al integrar.

### Escritura

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/projects` | Inventario del proyecto | 201 `{project}` · 409 si duplicado |
| `POST /api/accounts` | Cuenta pública vigilada | 201 `{account}` · 400 si el `projectId` no existe · 409 si duplicada |
| `POST /api/scan` | *(vacío)* | 200 `{scannedAt, findings, counts, incidents}` |
| `PATCH /api/incidents/{id}` | `{status}` con `acknowledged` o `resolved` | 200 `{incident}` · 404 si no existe |
| `POST /api/approvals` | `{hash, purpose}` | 201 `{approval}` |
| `POST /api/observe/event` | Evento de proyecto o wallet | 201 `{event}` |
| `POST /api/node/refresh` | *(vacío)* | 200 `{node}` |

`POST /api/observe/event` **bifurca por el campo `type`**: si está en
`WALLET_EVENT_TYPES` va al camino de wallet; si es `privileged_role_change` o
`value_outflow`, al de proyecto. Cualquier otro valor devuelve 400.

### Ejemplo seguro

Petición:

~~~bash
curl -s -X POST http://127.0.0.1:8790/api/scan \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  -H "x-rootcause-actor: operador-local" \
  -d "{}"
~~~

Respuesta (recortada):

~~~json
{
  "scannedAt": "2026-08-27T12:00:00.000Z",
  "findings": 12,
  "counts": { "critical": 4, "high": 5, "medium": 3, "low": 0, "info": 0 },
  "incidents": [
    {
      "id": "a1b2c3d4e5f60718293a",
      "code": "BLK-WALLET-001",
      "severity": "critical",
      "title": "Allowance ilimitado o superior a política",
      "rootCause": "Una autorización de gasto vigente excede el uso declarado…",
      "status": "open",
      "createdAt": "2026-08-20T09:14:02.000Z",
      "lastSeenAt": "2026-08-27T12:00:00.000Z"
    }
  ]
}
~~~

---

## API v1 de inteligencia · `/api/v1/*`

Veinticinco rutas, versionadas desde el primer día. La cabecera del archivo
`src/api/intelligence-router.js` explica por qué: una wallet o un servicio que
consulte riesgo necesita un contrato estable.

### Lo que esta API NO hace, declarado en el código

> «Lo que esta API NO hace, y no hará: pedir claves privadas, frases semilla o
> autorización para mover fondos; construir, firmar o transmitir transacciones;
> bloquear una operación. El endpoint de análisis previo de una transacción es
> EXPLÍCITAMENTE consultivo: devuelve advertencias, no permisos.»

No es solo un comentario: `scripts/check-security-claims.js` lo ejercita en
caliente contra la aplicación en marcha.

### Estado y catálogo

| Ruta | Devuelve |
|---|---|
| `GET /api/v1/intelligence/summary` | `{apiVersion, summary}` con redes, transacciones, huérfanas, bloques, reorgs, indicadores, alertas por severidad, casos, evidencia, tamaño del grafo, registros, `modelVersion` y métricas de conectores |
| `GET /api/v1/intelligence/indicators` | Catálogo completo de los 15 indicadores |
| `GET /api/v1/intelligence/connectors` | Conectores con sus capacidades y métricas |
| `GET /api/v1/intelligence/datasets` | Los 10 escenarios con su resultado esperado |

### Pipeline

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/v1/intelligence/ingest` | `{blocks[], transactions[], source, datasetId}` | **202** `{run}` |
| `POST /api/v1/intelligence/ingest/dataset` | `{datasetId}` | **202** `{dataset, run}` |
| `POST /api/v1/intelligence/ingest/connector` | `{connectorId, options}` | **202** `{run}` |
| `POST /api/v1/intelligence/analyze` | *(vacío)* | 200 `{analyzedAt, indicators, alertsCreated}` |

**Límites de lote aplicados en el router**, antes de tocar el servicio: 500
bloques y 5000 transacciones por petición. Lo que exceda se descarta con
`slice`, **sin aviso**. Es un truncado silencioso: registrado en
[15 · Riesgos](15-risks-and-technical-debt.md).

El 202 es correcto semánticamente —la ingesta acepta el lote y el análisis es un
paso posterior—, pero conviene saber que la operación **sí es síncrona**: cuando
la respuesta llega, el estado ya está escrito.

### Riesgo

| Ruta | Nota |
|---|---|
| `GET /api/v1/risk/addresses/{red}/{dirección}` | Evaluación completa |
| `GET /api/v1/risk/contracts/{red}/{dirección}` | **Mismo manejador** que la anterior |
| `POST /api/v1/risk/transactions` | Análisis previo **consultivo** |

#### Garantías de la respuesta de riesgo

**Hecho verificado** — no hay ninguna rama de código que las incumpla:

| Garantía | Campo |
|---|---|
| Nunca viaja solo el número | `factorsIncreasing[]`, `factorsDecreasing[]` |
| Cada factor tiene nombre, puntos, peso y detalle | Estructura del factor |
| La confianza es independiente del puntaje | `confidence` |
| Las limitaciones son explícitas y contextuales | `limitations[]` |
| Se declara siempre que requiere revisión humana | `requiresHumanReview: true` |
| Se declara sobre qué datos se calculó | `dataScope` |
| El modelo está versionado | `modelVersion` |
| La proximidad lleva su advertencia | `proximity.caveat` |

#### Ejemplo de análisis previo de transacción

~~~bash
curl -s -X POST http://127.0.0.1:8790/api/v1/risk/transactions \
  -H "content-type: application/json" -H "x-rootcause-request: 1" \
  -d '{"network":"ethereum","from":"0x1111111111111111111111111111111111111111","to":"0x2222222222222222222222222222222222222222"}'
~~~

~~~json
{
  "network": "ethereum",
  "from": "0x1111111111111111111111111111111111111111",
  "to": "0x2222222222222222222222222222222222222222",
  "counterparty": { "score": 62, "band": "high", "requiresHumanReview": true, "…": "…" },
  "warnings": ["El destino acumula indicadores investigables: revisa antes de continuar."],
  "decision": "advisory-only",
  "notice": "RootCause no construye, firma ni transmite transacciones. Este análisis es informativo y no autoriza ni bloquea ninguna operación.",
  "evaluatedAt": "2026-08-27T12:00:00.000Z"
}
~~~

**`decision` siempre vale `advisory-only`.** No existe `allow` ni `deny` en
ninguna rama del código.

### Grafo

| Ruta | Parámetros de consulta |
|---|---|
| `GET /api/v1/intelligence/graph/{red}/{dirección}` | `direction`, `depth`, `maxNodes`, `maxEdges`, `asset`, `minAmountRaw`, `since`, `until` |
| `GET /api/v1/intelligence/paths` | `network`, `from`, `to` (**obligatorios**), `depth`, `maxPaths` |
| `GET /api/v1/intelligence/cycles` | `depth`, `maxCycles` |
| `GET /api/v1/intelligence/communities` | `limit` |

Todos los parámetros pasan por `bound()`, que **acota en silencio** al máximo
permitido. Pedir `depth=999` no es un error: devuelve profundidad 6.
`scripts/check-security-claims.js` lo comprueba («el grafo aplica sus cotas
aunque se pidan valores extremos»).

### Alertas, casos y evidencia

| Ruta | Nota |
|---|---|
| `GET /api/v1/intelligence/alerts` | Filtros `status` y `subject` |
| `PATCH /api/v1/intelligence/alerts/{id}` | `{status, note, assignedTo}`. Al marcar `false-positive` se guardan `falsePositiveReason` y `falsePositiveAt`; si no se envía `note`, el motivo queda como «Sin motivo declarado» |
| `GET /api/v1/intelligence/cases` | — |
| `POST /api/v1/intelligence/cases` | `{title, summary, priority, assignedTo, alertIds[]}` |
| `PATCH /api/v1/intelligence/cases/{id}` | `{status, note, decision, alertIds[]}` — todo queda en `timeline` |
| `POST /api/v1/intelligence/cases/{id}/evidence` | `{kind, description, payload, source}` — se sella con hash |
| `GET /api/v1/intelligence/cases/{id}/report` | Informe completo con aviso epistémico |
| `GET /api/v1/intelligence/evidence/verify` | Verifica **toda** la evidencia y lista la manipulada |

### Registros locales

| Ruta | Nota |
|---|---|
| `POST /api/v1/intelligence/registry/{contracts\|drainers\|bridges}` | En `drainers`, `flagged` se fuerza a `true` |
| `POST /api/v1/intelligence/exploits` | `{network, address, label, occurredAt, description}` |

Estos registros son **locales del operador**. Nunca se consultan fuera: hacerlo
revelaría qué se está investigando.

---

## Integraciones externas

### Nodo EVM propio — implementada

| Aspecto | Valor |
|---|---|
| Protocolo | JSON-RPC 2.0 sobre HTTP POST |
| Métodos permitidos | 9, todos de lectura |
| Destino por defecto | **Obligatoriamente loopback** |
| Timeout | 5000 ms (`AbortSignal.timeout`) |
| Límite de respuesta | 2 MB, cortado mientras se lee |
| Credenciales en la URL | **Rechazadas** |
| Reintentos | En el conector: 3 intentos con espera exponencial |
| Ritmo | 60 peticiones/minuto en el conector |
| Errores | Se convierten en `BLK-NODE-001/002/003` |

Métodos: `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`,
`eth_getCode`, `eth_getStorageAt`, `eth_call`, `eth_getLogs`, `net_version`,
`web3_clientVersion`.

**Doble vigilancia:** además del gate que comprueba la allowlist, el workflow de
CI ejecuta un `grep` deliberadamente tosco sobre `src/` buscando métodos de
firma o envío. La redundancia es intencionada.

### Nodo Bitcoin — disponible, no conectado

`BitcoinRpcConnector` está implementado con su propia allowlist de 5 métodos
(`getblockchaininfo`, `getblockhash`, `getblock`, `getrawtransaction`,
`getblockcount`), pero **`buildRuntime` no lo registra**. Para usarlo haría falta
registrarlo en el `ConnectorRegistry` y exponer su configuración.

**Requiere validación:** si es una extensión prevista o un resto de exploración.

### Datasets locales — implementada y por defecto

Diez escenarios en `examples/datasets`, cada uno con `expected.indicators`. Es
la fuente por defecto: permite ejecutar el pipeline completo sin tocar la red y
sin revelar a nadie qué se investiga.

### Resto de la familia RootCause — documentada, no implementada

[`../INTEGRATION-ROOTCAUSE.md`](../INTEGRATION-ROOTCAUSE.md) describe el encaje
previsto y [`../WALLET-SECURITY-BOUNDARIES.md`](../WALLET-SECURITY-BOUNDARIES.md)
el backlog por producto. **No hay código de integración en este repositorio.**

### Integraciones inexistentes por diseño

Telemetría, analítica, informes de fallo, actualizaciones automáticas, listas de
reputación, exploradores de bloques, proveedores RPC alojados, servicios de
precio y notificaciones externas. **Ninguna existe**, y varios gates impiden
introducirlas sin darse cuenta.

---

## Webhooks, reintentos y límites

| Aspecto | Estado |
|---|---|
| Webhooks salientes | **No existen** |
| Webhooks entrantes | No hay endpoint específico; un colector usa `POST /api/observe/event` |
| Reintentos del servidor | No hay: quien reintenta es el conector, hacia su fuente |
| Idempotencia para el llamante | **Sí**, por `(chainId, transactionHash, logIndex)` en eventos wallet y por `network:hash` en la ingesta |
| Límite de ritmo entrante | 120/min por origen |
| Límite de ritmo saliente | 60/min por conector EVM, 30/min en el de Bitcoin |
| Paginación | **No existe.** Todas las colecciones se devuelven completas |

La ausencia de paginación es una limitación real: `GET /api/incidents` o
`GET /api/audit` devuelven todo. Con las cotas actuales es manejable, pero es lo
primero que habría que añadir si el volumen creciera. Registrado en
[15 · Riesgos](15-risks-and-technical-debt.md).

---

## Consumir la API desde otro producto local

Reglas mínimas para integrarse correctamente:

1. **Añade siempre `x-rootcause-request: 1`** en cualquier método que no sea
   `GET` o `HEAD`.
2. **Identifícate en `x-rootcause-actor`** con un valor que cumpla
   `[a-z0-9._@-]{1,80}`. Es trazabilidad, no autenticación.
3. **Trata `/api/v1` como el contrato estable.** Las rutas `/api/*` son internas
   del panel y pueden cambiar.
4. **No ignores `truncated`, `limitations` ni `dataScope`.** Un resultado
   truncado presentado como completo es peor que no tener resultado.
5. **No presentes el puntaje sin sus factores.** El producto se ha construido
   entero alrededor de esa regla.
6. **Respeta el ritmo:** 120 peticiones por minuto.
7. **Espera 202 en las ingestas** y 201 en las creaciones.
8. **No envíes material privado.** No solo será rechazado con 422: el intento
   queda registrado.

---

## Documentos relacionados

- [05 · Referencia técnica](05-technical-reference.md)
- [08 · Flujo de datos](08-data-flow.md)
- [11 · Seguridad](11-security.md)
- [`../API.md`](../API.md) — contrato HTTP del proyecto
- [`../openapi-intelligence.yaml`](../openapi-intelligence.yaml)
<!-- navegacion -->
---

**[← 08 · Flujo de datos](08-data-flow.md)** · **[Índice](README.md)** · **[10 · Configuración →](10-configuration.md)**
