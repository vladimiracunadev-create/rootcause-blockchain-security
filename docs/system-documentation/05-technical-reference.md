# 05 · Referencia técnica

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

Catálogo de constantes, variables, funciones, clases, tipos, estados, rutas,
comandos y códigos de error. Todo lo que aparece aquí está tomado literalmente
del código: los nombres se pueden buscar con `grep`.

---

## Variables de entorno

Origen: `src/config.js` (`loadConfig`) y `.env.example`.

| Variable | Tipo | Por defecto | Rango forzado | Efecto |
|---|---|---|---|---|
| `HOST` | texto | `127.0.0.1` | — | Interfaz de escucha |
| `PORT` | entero | `8790` | 0 – 65535 | Puerto; `0` pide uno efímero |
| `DEMO_MODE` | booleano | `true` | — | Elige `MemoryStore` o `EncryptedFileStore` |
| `DATA_DIR` | ruta | `./data` | — | Se resuelve a absoluta |
| `ROOTCAUSE_DATA_KEY` | texto | `""` | 32 bytes tras decodificar | Clave AES-256-GCM |
| `REQUEST_BODY_LIMIT_BYTES` | entero | `131072` | 1024 – 1048576 | Corte del cuerpo JSON |
| `RATE_LIMIT_PER_MINUTE` | entero | `120` | 10 – 10000 | Peticiones por minuto y origen |
| `EVM_RPC_URL` | URL | `http://127.0.0.1:8545` | http/https, sin credenciales | Endpoint del observador |
| `EVM_EXPECTED_CHAIN_ID` | texto | `"1"` | — | Comparado con `eth_chainId` |
| `EVM_ALLOW_REMOTE_RPC` | booleano | `false` | — | Permite host no-loopback |
| `EVM_RPC_TIMEOUT_MS` | entero | `5000` | 500 – 60000 | `AbortSignal.timeout` |
| `EVM_RPC_RESPONSE_LIMIT_BYTES` | entero | `2097152` | 1024 – 16777216 | Corte de la respuesta RPC |
| `WATCHTOWER_ENABLED` | booleano | `false` | — | Activa el ciclo periódico |
| `WATCHTOWER_INTERVAL_MS` | entero | `15000` | 5000 – 3600000 | Periodo del watchtower |
| `ROOTCAUSE_OPEN_BROWSER` | texto | `"0"` | `"1"` activa | Abre el navegador solo en loopback |
| `ROOTCAUSE_CHROME` | ruta | *(sin valor)* | debe existir | Navegador para imprimir PDF |

Notas de comportamiento **verificadas en el código**:

- `parseBoolean` trata la cadena vacía como *ausente* y devuelve el valor por
  defecto; solo `"true"` (sin distinguir mayúsculas) es verdadero.
- `parseInteger` **acota en vez de rechazar**: `PORT=999999` no falla, se
  convierte en `65535`.
- El objeto devuelto por `loadConfig` está congelado, igual que sus sub-objetos
  `evm` y `watchtower`.

---

## Constantes exportadas

| Constante | Archivo | Valor / contenido |
|---|---|---|
| `PROJECT_ROOT` | `src/config.js` | Ruta absoluta de la raíz del repositorio |
| `SEVERITY_WEIGHT` | `src/domain/risk.js` | `critical:100, high:75, medium:45, low:20, info:5` |
| `MAX_UINT256` | `src/domain/wallet-rules.js` y `src/domain/intelligence/indicators.js` | `2^256 − 1` como `BigInt` |
| `WALLET_EVENT_TYPES` | `src/domain/wallet-rules.js` | Los 7 tipos de evento wallet |
| `NETWORKS` | `src/domain/intelligence/model.js` | `bitcoin` (UTXO, 8 decimales) y `ethereum` (cuentas, 18) |
| `EPISTEMIC_LEVELS` | `src/domain/intelligence/model.js` | `observed-fact`, `indicator`, `inference`, `hypothesis`, `verified-identity` |
| `CONFIDENCE_LEVELS` | `src/domain/intelligence/model.js` | `low`, `medium`, `high` |
| `SOURCE_RELIABILITY` | `src/domain/intelligence/model.js` | `own-node:1.0`, `local-dataset:0.9`, `indexer:0.75`, `explorer:0.6`, `third-party-intel:0.5`, `unknown:0.3` |
| `GRAPH_LIMITS` | `src/domain/intelligence/graph.js` | `maxDepth:6, maxNodes:2000, maxEdges:8000, maxPaths:25, maxCycles:50` |
| `ALERT_STATUSES` | `src/services/intelligence-service.js` | `new`, `in-review`, `confirmed`, `false-positive`, `mitigated`, `closed` |
| `CASE_STATUSES` | `src/services/intelligence-service.js` | `open`, `in-review`, `closed` |
| `DATASET_DIRECTORY` | `src/services/intelligence-datasets.js` | `examples/datasets` resuelto en absoluto |

### Constantes internas relevantes

| Constante | Archivo | Contenido |
|---|---|---|
| `STATIC_FILES` | `src/app.js` | Mapa cerrado de 7 rutas servibles |
| `READ_ONLY_METHODS` | `src/infrastructure/evm-rpc.js` | `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getStorageAt`, `eth_call`, `eth_getLogs`, `net_version`, `web3_clientVersion` |
| `LOCAL_HOSTS` | `src/infrastructure/evm-rpc.js` | `127.0.0.1`, `::1`, `localhost` |
| `BITCOIN_READ_ONLY_METHODS` | `src/services/intelligence-connectors.js` | `getblockchaininfo`, `getblockhash`, `getblock`, `getrawtransaction`, `getblockcount` |
| `LIMITS` | `src/services/intelligence-service.js` | `transactions:20000, blocks:5000, indicators:5000, alerts:2000, evidence:5000, cases:500` |
| `CONFIDENCE_MULTIPLIER` | `src/domain/intelligence/risk-score.js` | `high:1, medium:0.85, low:0.7` |
| `ALGORITHM` | `src/infrastructure/encrypted-store.js` | `aes-256-gcm` |

---

## Vocabularios cerrados (enumeraciones)

Origen: `src/services/defense-service.js`.

| Nombre | Valores permitidos |
|---|---|
| `FAMILIES` | `evm`, `solana`, `cosmos`, `substrate`, `other` |
| `ENVIRONMENTS` | `production`, `staging`, `development`, `test` |
| `CRITICALITIES` | `low`, `medium`, `high`, `critical` |
| `PROJECT_STATUSES` | `active`, `paused`, `migration-required`, `retired` |
| `ADMIN_TYPES` | `eoa`, `multisig`, `timelock`, `governance`, `program-derived`, `none`, `unknown` |
| `GOVERNANCE_MODELS` | `multisig`, `token`, `council`, `offchain`, `none`, `unknown` |
| `EVENT_TYPES` | `privileged_role_change`, `value_outflow` |
| `ACCOUNT_TYPES` | `eoa`, `multisig`, `smart-account`, `contract-account`, `watch-only` |
| `SMART_ACCOUNT_CHANGE_KINDS` | `owner-added`, `owner-removed`, `guardian-changed`, `module-enabled`, `module-disabled`, `threshold-changed`, `implementation-upgraded`, `recovery-changed`, `unknown` |
| `WALLET_EVENT_TYPES` | `wallet.allowance.changed`, `wallet.operator.changed`, `wallet.permit.used`, `wallet.transfer.observed`, `wallet.smart-account.changed`, `wallet.delegation.changed`, `wallet.activity.observed` |
| Confianza de evento wallet | `observed`, `declared`, `heuristic` |
| Alcance de operador | `all`, `single` |
| Estándar de permit | `eip-2612`, `eip-712`, `permit2` |
| Dirección de transferencia | `in`, `out` |

### Estados

| Entidad | Estados | Transición permitida |
|---|---|---|
| **Incidente** | `open`, `acknowledged`, `resolved` | `open → acknowledged` y `→ resolved` por API; `open/acknowledged → resolved` automático cuando el hallazgo deja de aparecer |
| **Alerta** | los 6 de `ALERT_STATUSES` | Cualquiera hacia cualquiera, siempre con entrada en `history` |
| **Caso** | `open`, `in-review`, `closed` | `closed` fija `closedAt` |
| **Bloque / transacción** | normal u `orphaned` | Solo hacia `orphaned`, al detectar una reorganización |

---

## Funciones y métodos

Formato de cada ficha: **firma**, propósito, parámetros, retorno, excepciones,
efectos secundarios, quién la llama, a quién llama, ejemplo y riesgo al
modificarla.

### `loadConfig(env = process.env)` — `src/config.js`

- **Propósito:** producir la configuración efectiva del proceso.
- **Parámetros:** `env` — objeto tipo `process.env`.
- **Retorno:** objeto congelado con `host`, `port`, `demoMode`, `dataDir`,
  `dataFile`, `dataKey`, `bodyLimitBytes`, `rateLimitPerMinute`, `evm{…}`,
  `watchtower{…}`.
- **Excepciones:** ninguna. Los valores fuera de rango se **acotan**.
- **Efectos secundarios:** ninguno.
- **La llaman:** `buildRuntime`, `scripts/seed-demo.js`,
  `scripts/check-security-claims.js`, pruebas.
- **Ejemplo:** `loadConfig({ PORT: "0", DEMO_MODE: "false" })`.
- **Riesgo al modificar:** alto — quitar el acotado abre la puerta a
  configuraciones destructivas.

### `assertProductionConfig(config)` — `src/config.js`

- **Retorno:** `undefined`.
- **Excepciones:** `Error("ROOTCAUSE_DATA_KEY is required when DEMO_MODE=false…")`.
- **Riesgo al modificar:** crítico — es lo único que impide arrancar en modo
  persistente sin cifrado.

### `createApplication({ service, config, staticRoot, intelligenceRouter })` — `src/app.js`

- **Retorno:** `async function application(request, response)`.
- **Efectos secundarios:** escribe cabeceras y cuerpo en `response`; registra en
  `stderr` los errores 5xx.
- **Llama a:** `applySecurityHeaders`, el limitador, `validateMutationRequest`,
  `createApiRouter`, `fs.readFile` para los estáticos.
- **Riesgo al modificar:** crítico — toda la postura HTTP vive aquí.

### `jsonResponse(response, status, body, extraHeaders = {})` — `src/api/router.js`

- **Propósito:** emitir JSON con `content-length` correcto y
  `cache-control: no-store`.
- **Riesgo al modificar:** medio — quitar `no-store` permitiría que una respuesta
  con inventario quedara en caché del navegador.

### `assertNoSecretMaterial(value, path = "request")` — `src/domain/secret-guard.js`

- **Propósito:** rechazar material privado **antes** de que llegue al dominio.
- **Rechaza por nombre de campo:** cualquier clave cuya forma compacta
  (solo letras y dígitos, en minúsculas) contenga `privatekey`, `signingkey`,
  `secret`, `password`, `mnemonic`, `seed`, `seedphrase`, `recoveryphrase`,
  `recoverywords`, `keystore`, `walletbackup`, `xprv`, `tprv`, `wif`,
  `rawsignedtransaction`, `rpcpassword`, `authorization`, `authtoken`,
  `accesstoken`, `refreshtoken`, `clientsecret`, `apikey`.
- **Rechaza por contenido:** clave extendida `xprv`/`tprv`, clave WIF, bloque PEM
  de clave privada, URL con credenciales embebidas.
- **Excepciones:** `SecretMaterialError` (HTTP 422, `SECRET_MATERIAL_REJECTED`).
- **La llaman:** `normalizeProject`, `normalizeWatchedAccount`, `observeEvent`,
  `approvePolicyHash`, y en inteligencia `ingest`, `registerLocalRecord`,
  `registerExploit`, `updateAlert`, `openCase`, `updateCase`,
  `attachEvidence`, `assessTransactionIntent`.
- **Riesgo al modificar:** crítico. Es la promesa central del producto y hay 7
  invariantes en `scripts/check-security-claims.js` que la ejercitan.

### `redactForAudit(value)` — `src/domain/secret-guard.js`

- **Propósito:** que un dato sensible que llegara por otra vía no acabe escrito
  en la auditoría.
- **Comportamiento:** sustituye por `[REDACTED]`; trunca las cadenas a 512
  caracteres añadiendo `…`.
- **La llama:** `appendAuditEntry`.

### `riskScore(findings)` — `src/domain/risk.js`

- **Fórmula:** `min(100, round(máximo + Σ(otros × 0.08)))`; `0` si no hay
  hallazgos.
- **Motivación (inferencia):** un hallazgo crítico ya satura la escala; los
  demás suman poco para que la acumulación de ruido no eclipse la gravedad.

### `appendAuditEntry(audit, input)` — `src/infrastructure/audit-log.js`

- **Retorno:** un **array nuevo** (no muta el recibido) con la entrada añadida.
- **Campos de la entrada:** `id` (UUID), `occurredAt`, `actor`, `action`,
  `entityType`, `entityId`, `metadata` (redactada), `previousHash`, `hash`.
- **Primer eslabón:** `previousHash = "GENESIS"`.
- **Riesgo al modificar:** alto — cambiar `canonicalize` o `digest` invalida
  todas las cadenas ya escritas.

### `verifyAuditChain(audit)` — `src/infrastructure/audit-log.js`

- **Retorno:** `{valid: true, entries, head}` o
  `{valid: false, brokenAt, reason}` con `reason` en
  `previous_hash_mismatch` | `entry_hash_mismatch`.

### `decodeDataKey(value)` — `src/infrastructure/encrypted-store.js`

- **Acepta:** `Buffer` de 32 bytes, hexadecimal de 64 caracteres, o base64.
- **Excepciones:** `Error("A data-encryption key is required.")` o
  `Error("ROOTCAUSE_DATA_KEY must decode to exactly 32 bytes.")`.

### `encryptJson(value, keyInput)` / `decryptJson(envelope, keyInput)`

- **Sobre:** `{version: 1, algorithm: "aes-256-gcm", iv, tag, ciphertext}`, los
  tres últimos en base64. IV de 12 bytes aleatorio **por escritura**.
- **`decryptJson` lanza** si `version !== 1` o el algoritmo no coincide; y
  `decipher.final()` lanza si el tag de autenticación no valida —es decir, si
  el archivo fue manipulado.

### `EvmRpcClient.call(method, params = [])` — `src/infrastructure/evm-rpc.js`

- **Excepciones (con `code`):** `EVM_RPC_METHOD_REJECTED`,
  `EVM_RPC_RESPONSE_LIMIT`, `EVM_RPC_ERROR`.
- **Riesgo al modificar:** crítico — añadir un método a `READ_ONLY_METHODS`
  convertiría el observador en algo capaz de mutar estado. Hay un `grep` en CI
  que lo vigila además del gate.

### `EvmRpcClient.snapshot()`

- **Retorno:** `{id, family, endpoint, connected, expectedChainId, chainId,
  blockNumber, latestObservedBlockNumber, blockTimestamp, clientVersion,
  checkedAt}`.
- **Llama a:** cuatro métodos RPC en paralelo con `Promise.all`.

### `evaluateState(state, context)` — `src/domain/rule-engine.js`

- **Parámetros:** `state` completo; `context = { policies, now? }`.
- **Retorno:** array de hallazgos (posiblemente vacío).
- **Pureza:** total. No lee disco, no llama a red, no muta el estado.

### `evaluateWalletPosture(state, context)` — `src/domain/wallet-rules.js`

- **Precondición:** las cuentas vigiladas y los eventos ya normalizados.
- **Retorno:** hallazgos `BLK-WALLET-*`.

### `walletPostureSummary(state)` — `src/domain/wallet-rules.js`

- **Retorno:** `{accounts, smartAccounts, activeAllowances,
  unlimitedAllowances, activeOperators, delegations, unrecognizedSpenders,
  smartAccountChanges, unexpectedActivity, poisoningCandidates, openIncidents}`.
- **Nota:** **no re-evalúa**; cuenta sobre proyecciones e incidentes ya
  existentes.

### `normalizeAddress(networkId, value)` — `src/domain/intelligence/model.js`

- **Retorno:** `{network, address, displayAddress, kind}` con `kind` en
  `evm` | `p2pkh` | `p2sh` | `segwit`.
- **Excepciones:** `ADDRESS_INVALID`, `NETWORK_NOT_SUPPORTED`.
- **Detalle crítico:** para Bitcoin **verifica el checksum de verdad**
  (doble SHA-256 en base58check; polinomio bech32/bech32m con la constante
  correcta según la versión de testigo). No es una comprobación de forma.

### `formatAmount(rawValue, decimals = 0)`

- **Retorno:** cadena decimal exacta, o `null` si el valor no es un entero
  válido. **No usa coma flotante en ningún paso.**
- **Ejemplo:** `formatAmount("123456789", 8) === "1.23456789"`.

### `makeEvidence({ kind, description, payload, source, collectedBy })`

- **Retorno:** evidencia con `contentHash` (SHA-256 de `JSON.stringify(payload)`),
  `algorithm: "sha256"`, `immutable: true`.
- **Nota:** el hash se calcula sobre el JSON **tal cual**, sin canonicalizar. Dos
  objetos equivalentes con distinto orden de claves producen hashes distintos.
  Es intencionado —sella el objeto exacto— pero conviene saberlo.

### `evaluateIndicators({ transactions, catalog, policies, registries, now })`

- **Retorno:** array de indicadores, determinista en contenido y en orden.
- **Cada indicador incluye:** `id`, `indicator`, `subject`, `network`, `title`,
  `severity`, `confidence`, `explanation`, `evidence`, `relatedTransactions`,
  `falsePositives`, `recommendedAction`, `detectedAt`, `source`,
  `epistemicLevel`.

### `buildFundsGraph(transactions = [])`

- **Retorno:** `{nodes: Map, edges: Array, outgoing: Map, incoming: Map,
  stats:{nodeCount, edgeCount}}`.
- **Determinismo:** las listas de adyacencia se ordenan por `timestamp` y, en
  empate, por identificador de arista.
- **Coste:** se reconstruye en **cada** consulta de grafo o evaluación de riesgo.

### `traverse(graph, startKey, options)`

- **Opciones:** `direction` (`forward`|`backward`|`both`), `maxDepth`,
  `maxNodes`, `maxEdges`, `filter`.
- **Por defecto:** profundidad 3, 250 nodos, 1000 aristas.
- **Retorno:** incluye `truncated` y `truncationReasons`
  (`max-nodes` | `max-edges` | `max-depth`) y `found: false` si la dirección no
  está en el grafo.

### `assessRisk({ subject, network, indicators, proximity, context, policies, now })`

- **Retorno:** objeto con `score`, `band`, `bandLabel`, `confidence`,
  `modelVersion`, `evaluatedAt`, `epistemicLevel`, `summary`,
  `factorsIncreasing`, `factorsDecreasing`, `indicatorCount`,
  `distinctIndicators`, `sourceReliability`, `limitations`,
  `requiresHumanReview: true`, `recommendation`.
- **Invariante:** `requiresHumanReview` es **siempre** `true`. No hay ninguna
  rama que lo ponga a `false`.

### `DefenseService.mutate(mutator)` — `src/services/defense-service.js`

- **Propósito:** serializar toda escritura de estado.
- **Mecanismo:** encadena sobre `this.writeQueue`; la cola se «desactiva» ante
  un fallo con `.catch(() => {})` para que un error no bloquee las siguientes
  operaciones.
- **Riesgo al modificar:** crítico — sin esta serialización, dos peticiones
  concurrentes pueden perder escrituras.

### `mergeIncidents(existing, findings, now)` — `src/services/defense-service.js`

- **Reglas:**
  1. Un hallazgo presente conserva su `createdAt` original y actualiza
     `lastSeenAt`.
  2. Si estaba `acknowledged`, sigue `acknowledged`; si no, pasa a `open`.
  3. Un incidente `open` o `acknowledged` cuyo hallazgo **ya no aparece** pasa a
     `resolved` con `resolvedAt`.
  4. Se ordena por `lastSeenAt` descendente.

### `IntelligenceService.ingest({ blocks, transactions, source, datasetId }, actor)`

- **Idempotencia:** por `network:hash`. Un duplicado incrementa
  `transactionsDuplicated` y no entra.
- **Reorganizaciones:** un bloque a la misma altura con hash distinto marca el
  anterior y sus transacciones como `orphaned` —**no borra nada**— y registra el
  hecho en `ingestion.reorgs`.
- **Retorno:** el objeto `run` con `stats`.

### `IntelligenceService.assessTransactionIntent(input)`

- **Retorno:** siempre con `decision: "advisory-only"` y un `notice` que declara
  que el producto no construye, firma ni transmite transacciones.
- **Invariante comprobado en caliente** por `scripts/check-security-claims.js`.

### `loadDataset(id)` — `src/services/intelligence-datasets.js`

- **Defensa:** patrón `^[0-9a-z][0-9a-z-]{2,60}$` **más** comprobación de que la
  ruta resuelta no sale del directorio.
- **Excepciones:** `DATASET_REJECTED`, `DATASET_PATH_REJECTED`,
  `DATASET_NOT_FOUND`.

### `openBrowserIfRequested(env, config, url)` — `src/server.js`

- **Condiciones para abrir:** `ROOTCAUSE_OPEN_BROWSER === "1"` **y** el host es
  `localhost`, `::1` o empieza por `127.`.
- **Retorno:** `true` si lanzó el proceso, `false` en cualquier otro caso.
- **Robustez:** el hijo se lanza `detached`, con `stdio: "ignore"` y `unref()`;
  cualquier error se traga.

---

## Rutas HTTP

### API de defensa (sin versionar)

| Método | Ruta | Servicio | Respuesta |
|---|---|---|---|
| GET | `/api/health` | — | `{status, service, version, time}` |
| GET | `/api/summary` | `summary()` | Postura completa |
| GET | `/api/projects` | `projects()` | `{projects}` |
| POST | `/api/projects` | `addProject()` | 201 `{project}` |
| GET | `/api/accounts` | `accounts()` | `{accounts}` |
| POST | `/api/accounts` | `addWatchedAccount()` | 201 `{account}` |
| POST | `/api/scan` | `scan()` | `{scannedAt, findings, counts, incidents}` |
| GET | `/api/incidents` | `incidents()` | `{incidents}` |
| PATCH | `/api/incidents/{id}` | `updateIncident()` | `{incident}` |
| GET | `/api/policies` | `policiesDocument()` | `{policies}` |
| GET | `/api/controls` | `controlsCatalog()` | Catálogo completo |
| GET | `/api/audit` | `audit()` | `{verification, entries}` |
| POST | `/api/approvals` | `approvePolicyHash()` | 201 `{approval}` |
| POST | `/api/observe/event` | `observeEvent()` | 201 `{event}` |
| POST | `/api/node/refresh` | `refreshNode()` | `{node}` |

El identificador de incidente en la ruta debe cumplir `[a-f0-9]{20}`.

### API v1 de inteligencia

| Método | Ruta | Servicio |
|---|---|---|
| GET | `/api/v1/intelligence/summary` | `summary()` |
| GET | `/api/v1/intelligence/indicators` | `indicatorCatalog()` |
| GET | `/api/v1/intelligence/connectors` | `connectors.list()` |
| GET | `/api/v1/intelligence/datasets` | `listDatasets()` |
| POST | `/api/v1/intelligence/ingest` | `ingest()` — 202 |
| POST | `/api/v1/intelligence/ingest/dataset` | `ingestDataset()` — 202 |
| POST | `/api/v1/intelligence/ingest/connector` | `ingestFromConnector()` — 202 |
| POST | `/api/v1/intelligence/analyze` | `analyze()` |
| GET | `/api/v1/risk/addresses/{red}/{dirección}` | `assess()` |
| GET | `/api/v1/risk/contracts/{red}/{dirección}` | `assess()` |
| POST | `/api/v1/risk/transactions` | `assessTransactionIntent()` |
| GET | `/api/v1/intelligence/graph/{red}/{dirección}` | `graph()` |
| GET | `/api/v1/intelligence/paths` | `paths()` |
| GET | `/api/v1/intelligence/cycles` | `cycles()` |
| GET | `/api/v1/intelligence/communities` | `communities()` |
| GET | `/api/v1/intelligence/alerts` | `alerts()` |
| PATCH | `/api/v1/intelligence/alerts/{id}` | `updateAlert()` |
| GET | `/api/v1/intelligence/cases` | `cases()` |
| POST | `/api/v1/intelligence/cases` | `openCase()` — 201 |
| PATCH | `/api/v1/intelligence/cases/{id}` | `updateCase()` |
| POST | `/api/v1/intelligence/cases/{id}/evidence` | `attachEvidence()` — 201 |
| GET | `/api/v1/intelligence/cases/{id}/report` | `caseReport()` |
| GET | `/api/v1/intelligence/evidence/verify` | `verifyEvidenceIntegrity()` |
| POST | `/api/v1/intelligence/registry/{contracts\|drainers\|bridges}` | `registerLocalRecord()` — 201 |
| POST | `/api/v1/intelligence/exploits` | `registerExploit()` — 201 |

Patrones de los parámetros de ruta: red `[a-z]{3,20}`, dirección
`[A-Za-z0-9]{20,128}`, identificador `[a-z]+-[a-f0-9]{20}`.

Parámetros de consulta admitidos en el grafo: `direction`, `depth`, `maxNodes`,
`maxEdges`, `asset`, `minAmountRaw`, `since`, `until`. En `paths`: `network`,
`from`, `to`, `depth`, `maxPaths`. En `alerts`: `status`, `subject`.

### Rutas estáticas

`/`, `/index.html`, `/app.js`, `/styles.css`, `/sw.js`, `/icon.svg` y el
manifiesto PWA. Cualquier otra ruta devuelve 404 JSON. No hay servidor de
archivos genérico: el mapa es cerrado.

---

## Cabeceras HTTP

### Emitidas en toda respuesta

| Cabecera | Valor |
|---|---|
| `content-security-policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| `cross-origin-opener-policy` | `same-origin` |
| `cross-origin-resource-policy` | `same-origin` |
| `x-content-type-options` | `nosniff` |
| `x-frame-options` | `DENY` |
| `referrer-policy` | `no-referrer` |
| `permissions-policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `x-request-id` | UUID por petición |

### Esperadas en la petición

| Cabecera | Cuándo | Efecto si falta o es incorrecta |
|---|---|---|
| `content-type: application/json` | Cualquier cuerpo | 415 |
| `x-rootcause-request: 1` | POST, PUT, PATCH, DELETE | 403 `MUTATION_HEADER_REQUIRED` |
| `sec-fetch-site` | La pone el navegador | 403 `CROSS_SITE_REQUEST_REJECTED` si no es `same-origin` ni `none` |
| `x-rootcause-actor` | Opcional | Se usa como etiqueta de auditoría; si no cumple `[a-z0-9._@-]{1,80}` cae a `local-user` |

---

## Códigos de error

| HTTP | `code` | Origen | Significado |
|---|---|---|---|
| 400 | `REQUEST_REJECTED` | validadores de servicio | Entrada mal formada o fuera de vocabulario |
| 400 | `DATASET_REJECTED` | `loadDataset` | Identificador de dataset inválido |
| 400 | `DATASET_PATH_REJECTED` | `loadDataset` | La ruta resuelta salía del directorio |
| 400 | `INTELLIGENCE_INPUT_REJECTED` | `model.js` | Entrada de inteligencia inválida |
| 400 | `ADDRESS_INVALID` | `normalizeAddress` | Dirección que no supera la validación |
| 400 | `NETWORK_NOT_SUPPORTED` | `networkFor` | Red desconocida |
| 400 | `HASH_INVALID` | `normalizeHash` | Hash que no es de 32 bytes |
| 400 | `AMOUNT_INVALID` | `normalizeAmount` | Monto que no es entero sin signo |
| 400 | `BLOCK_INVALID` / `TRANSFER_INVALID` | `model.js` | Entidad inconsistente |
| 403 | `MUTATION_HEADER_REQUIRED` | `validateMutationRequest` | Falta la cabecera local |
| 403 | `CROSS_SITE_REQUEST_REJECTED` | `validateMutationRequest` | Mutación cross-site |
| 404 | `NOT_FOUND` | routers y servicios | Ruta o recurso inexistente |
| 404 | `DATASET_NOT_FOUND` | `loadDataset` | Dataset inexistente |
| 409 | *(sin código)* | `addProject`, `addWatchedAccount` | Duplicado |
| 413 | *(sin código)* | `readJson` | Cuerpo por encima del límite |
| 415 | *(sin código)* | `readJson` | `content-type` incorrecto |
| 422 | `SECRET_MATERIAL_REJECTED` | `assertNoSecretMaterial` | Material privado en la petición |
| 429 | `RATE_LIMITED` | limitador HTTP o de conector | Demasiadas peticiones |
| 500 | `INTERNAL_ERROR` | `src/app.js` | Fallo interno; el detalle **no** viaja al cliente |

### Códigos de error internos del cliente RPC

`EVM_RPC_URL_INVALID`, `EVM_RPC_PROTOCOL_REJECTED`,
`EVM_RPC_CREDENTIALS_REJECTED`, `EVM_RPC_REMOTE_REJECTED`,
`EVM_RPC_METHOD_REJECTED`, `EVM_RPC_RESPONSE_LIMIT`, `EVM_RPC_ERROR`,
`CONNECTOR_METHOD_REJECTED`.

De todos ellos, `isRetryable` considera **no reintentables** los que empiezan por
`EVM_RPC_METHOD`, `EVM_RPC_REMOTE`, `EVM_RPC_CREDENTIALS`, `EVM_RPC_PROTOCOL`,
`EVM_RPC_URL`, más `CONNECTOR_METHOD_REJECTED` y `RATE_LIMITED`: reintentar un
rechazo por política no lo convierte en aceptación.

---

## Eventos de auditoría

Valores del campo `action`, todos verificados en el código:

`application_initialized`, `project_registered`, `risk_scan_completed`,
`incident_acknowledged`, `incident_resolved`, `policy_hash_approved`,
`watched_account_registered`, `wallet_event_observed`, `chain_event_observed`,
`node_snapshot_refreshed`, `intelligence_ingest_completed`,
`intelligence_registry_updated`, `intelligence_exploit_registered`,
`intelligence_analysis_completed`, `intelligence_alert_updated`,
`intelligence_case_opened`, `intelligence_case_updated`,
`intelligence_evidence_attached`.

## Eventos de registro (stdout / stderr)

| Evento | Flujo | Cuándo |
|---|---|---|
| `server_started` | stdout | Tras escuchar el puerto |
| `startup_failed` | stderr | Fallo durante el arranque; sale con código 1 |
| `request_failed` | stderr | Cualquier error 5xx |
| `watchtower_tick_failed` | stderr | Fallo de un ciclo del watchtower |

---

## Comandos

| Comando | Script equivalente |
|---|---|
| `pnpm start` | `node src/server.js` |
| `pnpm dev` | `node --watch src/server.js` |
| `pnpm test` | `node --test` |
| `pnpm lint` | `node scripts/validate-repo.js` |
| `pnpm check` | Los cinco gates encadenados |
| `pnpm check:local-only` | `node scripts/check-local-only.js` |
| `pnpm check:security` | `node scripts/check-security-claims.js` |
| `pnpm check:rules` | `node scripts/check-rule-coverage.js` |
| `pnpm check:docs` | `node scripts/check-docs.js` |
| `pnpm build:presentacion` | Genera y renderiza la presentación |
| `pnpm check:presentacion` | `node scripts/check-presentation.js` |
| `pnpm generate:data-key` | `node scripts/generate-key.js` |
| `pnpm seed:demo` | `node scripts/seed-demo.js` |
| `pnpm package:windows` | Icono + portable |
| — | `node scripts/build-system-docs.js` — genera esta documentación en HTML y PDF |

---

## Catálogos de reglas e indicadores

Los catálogos completos, con condición exacta, umbral, severidad, evidencia y
falsos positivos, viven en los documentos canónicos del proyecto:

- **22 reglas `BLK-*`** → [`../HEURISTICAS.md`](../HEURISTICAS.md)
- **15 indicadores `INT-*`** → [`../ONCHAIN-ANALYTICS.md`](../ONCHAIN-ANALYTICS.md)
- **13 controles** → `config/control-catalog.json`

Resumen de códigos, para búsqueda rápida:

| Familia | Códigos | Emitidos por |
|---|---|---|
| Contrato | `BLK-CONTRACT-001` | `evaluateProject` |
| Acceso | `BLK-ACCESS-001`, `BLK-ACCESS-002` | `evaluateProject` |
| Upgrade | `BLK-UPGRADE-001` | `evaluateProject` |
| Oráculo | `BLK-ORACLE-001`, `BLK-ORACLE-002` | `evaluateProject` |
| Puente | `BLK-BRIDGE-001` | `evaluateProject` |
| Gobernanza | `BLK-GOV-001` | `evaluateProject` |
| Suministro | `BLK-SUPPLY-001` | `evaluateProject` |
| Evento | `BLK-EVENT-001`, `BLK-FUNDS-001` | `evaluateEvent` |
| Nodo | `BLK-NODE-001/002/003` | `evaluateNode` |
| Wallet | `BLK-WALLET-001` … `BLK-WALLET-008` | `evaluateWalletPosture` |
| Flujo | `INT-FLOW-001` … `INT-FLOW-004` | `evaluateIndicators` |
| Comportamiento | `INT-BEHAV-001` … `INT-BEHAV-004` | `evaluateIndicators` |
| Exposición | `INT-EXPO-001` … `INT-EXPO-004` | `evaluateIndicators` |
| Activo | `INT-ASSET-001` | `evaluateIndicators` |
| Puente | `INT-BRIDGE-001` | `evaluateIndicators` |
| Exploit | `INT-EXPLOIT-001` | `evaluateIndicators` |

`BLK-WALLET-008` es el único código que **se emite desde más de un punto** (con
discriminadores distintos: reactivación, red no autorizada, ventana horaria y
contraparte nueva). `scripts/check-rule-coverage.js` lo tiene declarado como
excepción explícita en `MULTI_EMITTERS`.

---

## Documentos relacionados

- [06 · Explicación profunda del código](06-deep-code-explanation.md)
- [09 · APIs e integraciones](09-apis-and-integrations.md)
- [19 · Matriz de trazabilidad](19-traceability-matrix.md)
<!-- navegacion -->
---

**[← 04 · Mapa completo del código](04-code-map.md)** · **[Índice](README.md)** · **[06 · Explicación profunda del código →](06-deep-code-explanation.md)**
