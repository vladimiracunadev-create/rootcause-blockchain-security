# 04 · Mapa completo del código

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

Inventario jerárquico de todo lo que hay en el repositorio, con responsabilidad,
dependencias, consumidores y estado aparente de cada elemento.

**Leyenda de estado**

| Estado | Significado |
|---|---|
| **Activo** | Se ejecuta en el camino principal del producto |
| **Activo (opcional)** | Se ejecuta solo bajo una configuración concreta |
| **Herramienta** | Solo se ejecuta en desarrollo, CI o empaquetado |
| **Disponible, no conectado** | Implementado y probado, pero ningún camino de producción lo invoca |
| **Artefacto** | Generado, no fuente |

---

## Árbol de primer nivel

| Ruta | Contenido | Estado |
|---|---|---|
| `.github/` | 4 workflows + configuración de Dependabot | Herramienta |
| `build/` | Salida del empaquetado de Windows (ignorada por git) | Artefacto |
| `config/` | 4 archivos JSON: políticas y catálogos | Activo |
| `data/` | Estado cifrado en tiempo de ejecución (solo `.gitkeep` versionado) | Activo |
| `docs/` | 33 documentos, 1 OpenAPI, 7 capturas | Documentación |
| `examples/` | Muestras de entrada y 10 datasets de escenario | Activo |
| `landing/` | Página de producto para GitHub Pages | Herramienta |
| `packaging/windows/` | Empaquetado portable, instalador, icono, lanzadores | Herramienta |
| `presentacion/` | Diapositivas y pauta generadas (ignorada por git) | Artefacto |
| `scripts/` | 9 scripts de validación, gates y utilidades | Herramienta |
| `src/` | 24 archivos JavaScript: la aplicación | Activo |
| `test/` | 13 archivos de prueba, 144 pruebas | Herramienta |

Archivos sueltos de la raíz: `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
`SECURITY.md`, `LICENSE`, `MASTER_PROMPT.md`, `Dockerfile`, `compose.yaml`,
`.env.example`, `.editorconfig`, `.gitattributes`, `.gitignore`.

---

## `src/` — la aplicación

### Punto de entrada y composición

#### `src/server.js` — 161 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `readJson(filePath)` | función privada | Lee y parsea un JSON de configuración |
| `buildRuntime(env)` | función exportada | Compone el runtime completo y lo devuelve sin arrancar nada |
| `openBrowserIfRequested(env, config, url)` | función exportada | Abre el navegador **solo** si el lanzador lo pide y el bind es loopback |
| `startServer(env)` | función exportada | Crea el servidor HTTP, escucha, arranca el watchtower e instala el apagado limpio |

- **Depende de:** `config.js`, `app.js`, `encrypted-store.js`, `evm-rpc.js`,
  `demo-state.js`, `defense-service.js`, `watchtower.js`,
  `intelligence-router.js`, `intelligence-service.js`,
  `intelligence-datasets.js`, `intelligence-connectors.js`.
- **Lo usan:** el arranque del proceso, `scripts/check-security-claims.js`,
  `test/api.test.js`, `test/intelligence-api.test.js`,
  `test/desktop-launch.test.js`.
- **Importancia:** máxima. Es el único punto donde se decide la composición.
- **Estado:** Activo.

#### `src/config.js` — 51 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `PROJECT_ROOT` | constante exportada | Raíz del repositorio, resuelta desde `import.meta.url` |
| `parseBoolean(value, fallback)` | función privada | Convierte a booleano tratando el vacío como ausencia |
| `parseInteger(value, fallback, min, max)` | función privada | Convierte y **acota** al rango permitido |
| `loadConfig(env)` | función exportada | Devuelve la configuración **congelada** |
| `assertProductionConfig(config)` | función exportada | Falla si `DEMO_MODE=false` sin clave de datos |

- **Depende de:** solo `node:path` y `node:url`.
- **Lo usan:** `server.js`, `intelligence-datasets.js`, los 6 scripts de
  validación (por `PROJECT_ROOT`) y varias pruebas.
- **Riesgo al modificar:** alto. `parseInteger` es la única defensa contra un
  valor de entorno absurdo; quitarla permitiría, por ejemplo, un límite de
  cuerpo de 4 GB.
- **Estado:** Activo.

### Capa HTTP

#### `src/app.js` — 154 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `STATIC_FILES` | constante congelada | Mapa cerrado ruta → (archivo, MIME). Impide el *path traversal* por construcción |
| `applySecurityHeaders(response)` | función privada | 7 cabeceras de seguridad en **toda** respuesta |
| `createRateLimiter(limitPerMinute)` | función privada | Ventana fija de 60 s por dirección de origen |
| `validateMutationRequest(request)` | función privada | Exige `x-rootcause-request: 1` y rechaza `sec-fetch-site` cross-site |
| `createApplication({...})` | función exportada | Devuelve el manejador `(request, response)` |
| `readJson(request)` | closure interna | Exige `application/json` y corta al superar el límite |

- **Depende de:** `src/api/router.js`.
- **Lo usan:** `server.js` y las pruebas de API.
- **Riesgo al modificar:** muy alto. Es la superficie de ataque completa del
  producto y varios invariantes de `scripts/check-security-claims.js` y de
  `scripts/check-local-only.js` la comprueban directamente.
- **Estado:** Activo.

#### `src/api/router.js` — 107 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `actorFrom(request)` | función privada | Extrae y valida `x-rootcause-actor`; cae a `local-user` |
| `jsonResponse(response, status, body, extraHeaders)` | función exportada | Respuesta JSON con `content-length` y `cache-control: no-store` |
| `createApiRouter({...})` | función exportada | 15 rutas de defensa; delega primero en el router de inteligencia |

- **Lo usan:** `src/app.js` y `src/api/intelligence-router.js` (importa
  `jsonResponse`).
- **Nota de mantenimiento:** la versión `0.3.0` está **escrita a mano** en el
  cuerpo de `/api/health`. Ver
  [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).
- **Estado:** Activo.

#### `src/api/intelligence-router.js` — 292 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `API_VERSION` | constante | `"v1"` |
| `badRequest(message)` | función privada | Error 400 con `code: REQUEST_REJECTED` |
| `integerParam` / `textParam` | funciones privadas | Validan parámetros de consulta contra un patrón |
| `filterFrom(url)` | función privada | Construye el filtro de aristas del grafo |
| `NETWORK` / `ADDRESS` / `IDENTIFIER` | constantes de patrón | Fragmentos de expresión regular reutilizados en las rutas |
| `createIntelligenceRouter({intelligence})` | función exportada | Tabla de 25 rutas; devuelve `null` si no reconoce la ruta |

- **Contrato clave:** devolver `null` en vez de un 404 es lo que permite que
  `routeApi` siga probando sus propias rutas.
- **Estado:** Activo.

### Dominio de defensa

#### `src/domain/rule-engine.js` — 432 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `findingId(code, entityId, discriminator)` | función privada | SHA-256 truncado a 20 caracteres: identidad estable del hallazgo |
| `makeFinding(input)` | función privada | Da forma común a todo hallazgo (`id`, `detectedAt`, `status: "open"`) |
| `severityFor(project, high, lower)` | función privada | Escala la severidad por criticidad del proyecto |
| `evaluateProject(project, context)` | función exportada | 9 reglas: contratos, oráculos, puentes, gobernanza, dependencias |
| `evaluateEvent(event, approvals, policies)` | función exportada | 2 reglas: cambio privilegiado y salida de valor |
| `evaluateNode(node, policies)` | función exportada | 3 reglas: disponibilidad, chain ID y retraso del observador |
| `evaluateState(state, context)` | función exportada | Compone las anteriores más `evaluateWalletPosture` |

- **Códigos emitidos:** `BLK-CONTRACT-001`, `BLK-ACCESS-001/002`,
  `BLK-UPGRADE-001`, `BLK-ORACLE-001/002`, `BLK-BRIDGE-001`, `BLK-GOV-001`,
  `BLK-SUPPLY-001`, `BLK-EVENT-001`, `BLK-FUNDS-001`, `BLK-NODE-001/002/003`.
- **Lo usa:** `DefenseService.evaluate`.
- **Riesgo al modificar:** alto. Cambiar un `code` o un `discriminator` cambia
  el `id` del hallazgo y **rompe la continuidad del incidente**: el anterior se
  marcaría como resuelto y aparecería uno nuevo.
- **Estado:** Activo.

#### `src/domain/wallet-rules.js` — 805 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `MAX_UINT256` | constante `BigInt` | Detecta el allowance ilimitado |
| `WALLET_EVENT_TYPES` | array congelado | Los 7 tipos de evento wallet aceptados |
| `latestAllowances(events)` | función exportada | Proyección: último allowance por (cadena, wallet, token, spender) |
| `latestOperators(events)` | función exportada | Proyección equivalente para operadores |
| `checkAllowanceRules` … `checkActivityRules` | 7 funciones privadas | Un detector por familia de regla |
| `evaluateWalletPosture(state, context)` | función exportada | Recorre cuentas y ejecuta los 7 detectores |
| `walletPostureSummary(state)` | función exportada | Contadores del panel, sin re-evaluar nada |

- **Códigos emitidos:** `BLK-WALLET-001` … `BLK-WALLET-008`.
- **Lo usan:** `rule-engine.js` (`evaluateWalletPosture`) y
  `defense-service.js` (`walletPostureSummary`, `WALLET_EVENT_TYPES`).
- **Estado:** Activo.

#### `src/domain/secret-guard.js` — 91 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `SecretMaterialError` | clase exportada | Error 422 con `code: SECRET_MATERIAL_REJECTED` |
| `assertNoSecretMaterial(value, path)` | función exportada | Recorre el objeto y lanza ante clave o valor prohibidos |
| `redactForAudit(value)` | función exportada | Sustituye por `[REDACTED]` y trunca a 512 caracteres |

- **Lo usan:** `defense-service.js`, `intelligence-service.js`, `audit-log.js`.
- **Importancia:** máxima. Es el guardián de la promesa central del producto.
- **Estado:** Activo.

#### `src/domain/risk.js` — 35 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `SEVERITY_WEIGHT` | constante congelada | `critical: 100 … info: 5` |
| `riskScore(findings)` | función exportada | Máximo + 8 % de cada hallazgo adicional, tope 100 |
| `riskLevel(score)` | función exportada | Banda textual del puntaje |
| `countBySeverity(findings)` | función exportada | Conteo por severidad |

- **Nota:** este puntaje **es distinto** del de inteligencia
  (`intelligence/risk-score.js`). Este mide postura de configuración; aquel,
  exposición a señales investigables.
- **Estado:** Activo.

### Dominio de inteligencia

#### `src/domain/intelligence/model.js` — 483 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `NETWORKS` | constante congelada | Bitcoin (UTXO) y Ethereum (cuentas) |
| `EPISTEMIC_LEVELS` | array congelado | Los 5 niveles, incluido `verified-identity`, que el sistema nunca produce |
| `CONFIDENCE_LEVELS`, `SOURCE_RELIABILITY` | constantes | Vocabulario de confianza y fiabilidad por tipo de fuente |
| `networkFor(id)` | función exportada | Resuelve la red o lanza `NETWORK_NOT_SUPPORTED` |
| `base58Decode`, `isValidBase58Check`, `bech32Polymod`, `bech32HrpExpand`, `isValidBech32` | funciones privadas | **Validación real de direcciones Bitcoin, implementada a mano** |
| `normalizeAddress(networkId, value)` | función exportada | Forma canónica de una dirección |
| `isValidAddress(networkId, value)` | función exportada | Envoltura booleana. **Solo la usan las pruebas** |
| `normalizeHash`, `transactionKey`, `blockKey`, `addressKey`, `stableId` | funciones | Claves de deduplicación e identificadores estables |
| `normalizeAmount`, `toBigInt`, `formatAmount` | funciones exportadas | Aritmética entera sobre unidades mínimas |
| `normalizeDataSource(input)` | función exportada | Procedencia con fiabilidad derivada del tipo |
| `normalizeBlock`, `normalizeTransaction` | funciones exportadas | Entidades normalizadas de ambas familias |
| `normalizeContractRecord(input)` | función exportada | Registro local de contrato o token |
| `makeWalletCluster({...})` | función exportada | Agrupación heurística. **Solo la usan las pruebas** |
| `makeEvidence`, `verifyEvidence` | funciones exportadas | Evidencia sellada por hash y su verificación |

- **Estado:** Activo, con dos exportaciones **disponibles, no conectadas**
  (`isValidAddress`, `makeWalletCluster`).
- **Nota técnica:** este archivo contiene un byte nulo literal dentro de una
  expresión regular (línea 170), lo que hace que git y `grep` lo traten como
  binario. Ver [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

#### `src/domain/intelligence/indicators.js` — 822 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `deriveConfidence(defaultConfidence, reliability, strong)` | función privada | Ajusta la confianza a la baja si la fuente es pobre |
| `aggregateSource(transactions)` | función privada | Toma la **fiabilidad mínima** de las fuentes implicadas |
| `makeIndicator(catalogEntry, input)` | función privada | Forma común del indicador, con falsos positivos del catálogo |
| `buildActivityIndex(transactions)` | función privada | Índice por dirección: entradas, salidas, contrapartes, tiempos |
| `detectFanIn`, `detectFanOut`, `detectRapidHops`, `detectPeelingChain` | privadas | Familia `INT-FLOW` |
| `detectSuddenActivity`, `detectStructuring`, `detectCoordination`, `detectBehaviourChange` | privadas | Familia `INT-BEHAV` |
| `detectFlaggedExposure`, `detectAddressPoisoning`, `detectUnlimitedApproval`, `detectPostExploitMovement` | privadas | Familias `INT-EXPO` e `INT-EXPLOIT` |
| `detectAssetConcentration`, `detectBridgeChaining` | privadas | Familias `INT-ASSET` e `INT-BRIDGE` |
| `evaluateIndicators({...})` | función exportada | Único punto de entrada del motor |

- **Estado:** Activo.

#### `src/domain/intelligence/graph.js` — 396 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `GRAPH_LIMITS` | constante congelada | Cotas duras del sistema |
| `bound(value, fallback, maximum)` | función privada | Acota cualquier parámetro recibido del exterior |
| `buildFundsGraph(transactions)` | función exportada | Nodos = direcciones, aristas = transferencias |
| `passesFilter(edge, filter)` | función privada | Filtro por activo, red, monto mínimo y ventana temporal |
| `publicNode(node)` | función privada | Proyección serializable (convierte `BigInt` a texto) |
| `traverse`, `findPaths`, `detectCycles`, `distanceToFlagged`, `findCommunities` | funciones exportadas | Los cinco recorridos, todos acotados |
| `fanSummary`, `graphSummary` | funciones exportadas | Resúmenes de concentración y de tamaño |

- **Estado:** Activo.

#### `src/domain/intelligence/risk-score.js` — 245 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `CONFIDENCE_MULTIPLIER` | constante congelada | `high: 1`, `medium: 0.85`, `low: 0.7` |
| `clamp`, `bandFor` | funciones privadas | Acotado y resolución de banda |
| `ageFactor(detectedAt, now, config)` | función privada | Decaimiento por semivida, con suelo |
| `assessRisk({...})` | función exportada | Puntaje **con** factores, confianza, limitaciones y recomendación |
| `describeBand(score, policies)` | función exportada | Banda de un puntaje ya calculado. **Sin consumidores** |

- **Estado:** Activo, con `describeBand` **disponible, no conectada**.

### Infraestructura

#### `src/infrastructure/encrypted-store.js` — 99 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `ALGORITHM` | constante | `"aes-256-gcm"` |
| `decodeDataKey(value)` | función exportada | Acepta hex de 64 o base64; exige exactamente 32 bytes |
| `encryptJson(value, keyInput)` | función exportada | Sobre con `version`, `algorithm`, `iv`, `tag`, `ciphertext` |
| `decryptJson(envelope, keyInput)` | función exportada | Rechaza sobres de versión o algoritmo distintos |
| `MemoryStore` | clase exportada | Almacén volátil con `structuredClone` en ambos sentidos |
| `EncryptedFileStore` | clase exportada | Escritura atómica (temporal + `rename`), `0600` / `0700` |

- **Estado:** Activo.

#### `src/infrastructure/audit-log.js` — 51 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `canonicalize(value)` | función privada | Ordena claves recursivamente: el hash no depende del orden de inserción |
| `digest(value)` | función privada | SHA-256 del JSON canónico |
| `appendAuditEntry(audit, input)` | función exportada | Añade una entrada encadenada al anterior; redacta la metadata |
| `verifyAuditChain(audit)` | función exportada | Verifica cada eslabón y devuelve dónde y por qué se rompió |

- **Estado:** Activo.

#### `src/infrastructure/evm-rpc.js` — 145 líneas

| Símbolo | Tipo | Responsabilidad |
|---|---|---|
| `READ_ONLY_METHODS` | `Set` privado | Los 9 métodos permitidos |
| `LOCAL_HOSTS` | `Set` privado | `127.0.0.1`, `::1`, `localhost` |
| `validateEndpoint(value, allowRemote)` | función privada | Rechaza protocolo, credenciales embebidas y destino remoto |
| `parseQuantity(value, name)` | función privada | Hex → número, con control de rango seguro |
| `readLimitedBody(response, max)` | función privada | Corta la respuesta antes de materializarla entera |
| `EvmRpcClient` | clase exportada | `call(method, params)` y `snapshot()` |
| `isReadOnlyEvmMethod(method)` | función exportada | Consulta de la allowlist, usada por `EvmRpcConnector` |

- **Estado:** Activo (opcional).

### Servicios

#### `src/services/defense-service.js` — 714 líneas

| Grupo | Símbolos | Responsabilidad |
|---|---|---|
| Vocabulario cerrado | `FAMILIES`, `ENVIRONMENTS`, `CRITICALITIES`, `PROJECT_STATUSES`, `ADMIN_TYPES`, `GOVERNANCE_MODELS`, `EVENT_TYPES`, `WALLET_EVENTS`, `ACCOUNT_TYPES`, `SMART_ACCOUNT_CHANGE_KINDS` | Enumeraciones permitidas |
| Validadores | `badRequest`, `text`, `optionalText`, `enumValue`, `integer`, `finiteNumber`, `boolean`, `isoDate`, `publicIdentifier`, `optionalTransactionHash`, `optionalApprovalHash`, `evmAddress`, `addressList`, `rawAmount` | Validación estricta en el borde |
| Normalizadores | `normalizeContract`, `normalizeOracle`, `normalizeBridge`, `normalizeDependency`, `normalizeProject`, `normalizeApprovalPolicy`, `normalizeWatchedAccount`, `normalizeWalletEvent` | Entrada libre → entidad canónica |
| Ciclo de vida | `mergeIncidents(existing, findings, now)` | Reaparece, se reconoce o se resuelve solo |
| Clase | `DefenseService` con 15 métodos públicos | Casos de uso de defensa |

- **Métodos de `DefenseService`:** `evaluate`, `initialize`, `mutate`,
  `summary`, `projects`, `addProject`, `scan`, `incidents`, `updateIncident`,
  `policiesDocument`, `controlsCatalog`, `audit`, `approvePolicyHash`,
  `accounts`, `addWatchedAccount`, `observeWalletEvent`, `observeEvent`,
  `refreshNode`.
- **Estado:** Activo.

#### `src/services/intelligence-service.js` — 871 líneas

| Grupo | Símbolos | Responsabilidad |
|---|---|---|
| Vocabulario | `ALERT_STATUSES` (6), `CASE_STATUSES` (3), `LIMITS` | Estados y cotas de retención |
| Auxiliares | `badRequest`, `notFound`, `safeText`, `registryMap`, `buildRegistries`, `flaggedKeys` | Validación y proyecciones |
| Estado | `createEmptyIntelligenceState()`, `IntelligenceService.ensureState(state)` | Creación y migración del bloque `intelligence` |
| Clase | `IntelligenceService` con 22 métodos | Pipeline, análisis, grafo, alertas, casos, evidencia, informe |

- **Métodos:** `read`, `ingest`, `ingestFromConnector`, `registerLocalRecord`,
  `registerExploit`, `activeTransactions`, `analyze`, `assess`,
  `assessTransactionIntent`, `graph`, `paths`, `cycles`, `communities`,
  `alerts`, `updateAlert`, `openCase`, `updateCase`, `cases`, `attachEvidence`,
  `verifyEvidenceIntegrity`, `caseReport`, `summary`, `topAlerts`,
  `indicatorCatalog`.
- **`topAlerts(limit)` no tiene ningún consumidor** ni en el router ni en el
  panel: **disponible, no conectado**.
- **Nota técnica:** contiene un byte nulo literal en una expresión regular
  (línea 80). Ver [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).
- **Estado:** Activo.

#### `src/services/intelligence-connectors.js` — 405 líneas

| Símbolo | Tipo | Estado |
|---|---|---|
| `RateLimiter` | clase exportada | Activo |
| `isRetryable(error)` | función exportada | Activo |
| `withRetry(operation, options)` | función exportada | Activo |
| `BaseConnector` | clase privada | Activo |
| `DatasetConnector` | clase exportada | **Activo** — registrado en `buildRuntime` |
| `EvmRpcConnector` | clase exportada | **Activo** — registrado en `buildRuntime` |
| `BitcoinRpcConnector` | clase exportada | **Disponible, no conectado** — implementado y con allowlist propia, pero `buildRuntime` no lo registra |
| `ConnectorRegistry` | clase exportada | Activo |

#### `src/services/intelligence-datasets.js` — 86 líneas

`DATASET_DIRECTORY`, `listDatasets()`, `loadDataset(id)`,
`ingestDataset(service, id, actor)`. Contiene la **defensa contra path
traversal**: patrón restrictivo de identificador más comprobación de que la ruta
resuelta sigue dentro del directorio. **Estado:** Activo.

#### `src/services/demo-state.js` — 471 líneas

`createEmptyState()`, `createDemoState()` y las privadas `hoursAgo`, `daysAgo`,
`demoHash`, `DEMO_ADDRESSES`, `createDemoWatchedAccounts`,
`createDemoWalletEvents`. Construye **nueve escenarios**, uno por cada regla de
wallet más uno sano. **Estado:** Activo (opcional, solo con `DEMO_MODE=true`) —
pero `createEmptyState` sí se usa siempre en modo persistente.

#### `src/services/watchtower.js` — 40 líneas

Clase `Watchtower` con `tick()`, `start()`, `stop()`. **Estado:** Activo
(opcional).

### Presentación

| Archivo | Líneas | Responsabilidad | Estado |
|---|---|---|---|
| `src/web/static/index.html` | 232 | Cinco vistas: postura, incidentes, wallet, inteligencia, inventario y controles | Activo |
| `src/web/static/app.js` | 660 | Modelo local, renderizado, navegación por `hash`, acciones | Activo |
| `src/web/static/styles.css` | 350 | Estilo del panel, sin framework | Activo |
| `src/web/static/sw.js` | 29 | Service Worker: cachea estáticos, **nunca** `/api/` | Activo |
| El manifiesto PWA de `src/web/static/` | — | Metadatos de instalación | Activo |
| `src/web/static/icon.svg` | — | Icono | Activo |

Funciones destacadas de `app.js`: `escapeHtml` (aplicada a **todo** lo que se
inserta en el DOM), `api(path, options)` (añade la cabecera de mutación),
`renderRisk`, `renderCausalFlow`, `renderIncidents`, `renderWallet`,
`renderAssessment`, `renderGraph`, `renderIntelligence`, `switchView`,
`showIncident`, `runAction`, `reload`.

---

## `config/` — políticas y catálogos

| Archivo | Contenido | Lo consume |
|---|---|---|
| `config/policies.json` | Umbrales de defensa, bloque `wallet` completo, lista de las 22 reglas | `buildRuntime` → `DefenseService` |
| `config/control-catalog.json` | 13 controles con su objetivo y sus reglas | `GET /api/controls` |
| `config/intelligence-indicators.json` | 6 familias y 15 indicadores con falsos positivos y acción recomendada | `IntelligenceService.catalog` |
| `config/intelligence-policies.json` | Umbrales `INT-*`, pesos de scoring, cotas del grafo | `IntelligenceService.policies` |

Los cuatro se cargan **una sola vez** en `buildRuntime` con `Promise.all`.
Cambiarlos exige reiniciar el proceso. **Hecho verificado.**

---

## `scripts/` — herramientas y gates

| Script | Qué hace | Se ejecuta en |
|---|---|---|
| `scripts/validate-repo.js` | Archivos obligatorios, JSON válido, `node --check` de cada `.js`, material privado, pruebas con `.only` | `pnpm lint`, CI |
| `scripts/check-local-only.js` | Cero dependencias, cero orígenes remotos, CSP intacta, sin proveedores alojados | `pnpm check`, CI |
| `scripts/check-security-claims.js` | 51 invariantes; arranca la aplicación real y la ataca | `pnpm check`, CI |
| `scripts/check-rule-coverage.js` | Motor ↔ catálogo ↔ política ↔ README, para `BLK-*` e `INT-*` | `pnpm check`, CI |
| `scripts/check-docs.js` | Todos los enlaces y rutas citadas en Markdown existen | `pnpm check`, CI |
| `scripts/check-presentation.js` | La presentación generada coincide con lo que anuncia el README | Publicación |
| `scripts/build-presentation.js` | Genera diapositivas y pauta desde `docs/presentacion.md` | Publicación |
| `scripts/render-presentation-pdf.js` | Imprime los PDF con Chrome/Edge por el protocolo DevTools | Publicación |
| `scripts/build-system-docs.js` | Genera HTML y PDF de esta carpeta de documentación | Manual |
| `scripts/generate-key.js` | Imprime una clave de datos de 32 bytes | Manual |
| `scripts/seed-demo.js` | Crea un estado cifrado inicial; se niega a sobrescribir | Manual |
| `scripts/lib/markdown.js` | Renderizador Markdown mínimo, escrito a mano | Herramientas |

---

## `test/` — pruebas

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `test/api.test.js` | 7 | Superficie HTTP, cabeceras, rechazos |
| `test/audit-log.test.js` | 2 | Encadenado y detección de manipulación |
| `test/desktop-launch.test.js` | 2 | `openBrowserIfRequested` y su guarda de loopback |
| `test/encrypted-store.test.js` | 3 | Cifrado, descifrado y validación de clave |
| `test/evm-rpc.test.js` | 4 | Allowlist, endpoint remoto, credenciales |
| `test/intelligence-api.test.js` | 14 | Rutas `/api/v1` |
| `test/intelligence-graph.test.js` | 13 | Grafo y sus cotas |
| `test/intelligence-indicators.test.js` | 14 | Los detectores `INT-*` |
| `test/intelligence-model.test.js` | 9 | Direcciones, montos, evidencia, clusters |
| `test/intelligence-pipeline.test.js` | 26 | Ingesta, reorgs, alertas, casos, evidencia |
| `test/rule-engine.test.js` | 4 | Reglas de proyecto, evento y nodo |
| `test/secret-guard.test.js` | 3 | Rechazo y redacción |
| `test/wallet-rules.test.js` | 33 | Las 8 reglas de wallet y sus negativos |

Total ejecutado: **144 pruebas** (los archivos contienen pruebas anidadas además
de las de primer nivel).

---

## `examples/` — muestras

| Archivo | Uso |
|---|---|
| `examples/project.sample.json` | Inventario de ejemplo para `POST /api/projects` |
| `examples/account.watched.sample.json` | Cuenta vigilada de ejemplo |
| `examples/event.abnormal-outflow.json` | Evento de salida de valor |
| `examples/event.privileged-change.json` | Cambio privilegiado |
| `examples/event.wallet-allowance.json` | Evento de allowance |
| `examples/datasets/` | 10 escenarios con su resultado esperado declarado |

Los datasets llevan un campo `expected.indicators` que las pruebas usan como
oráculo: el escenario declara qué debería activarse.

---

## `packaging/windows/`

| Archivo | Responsabilidad |
|---|---|
| `packaging/windows/build-portable.ps1` | Descarga el `node.exe` oficial, **verifica su SHA-256**, ensambla, arranca la app con ese runtime y comprime |
| `packaging/windows/make-icon.ps1` | Genera el icono multirresolución desde código |
| `packaging/windows/RootCause-Blockchain-Security.iss` | Instalador Inno Setup |
| `packaging/windows/launcher/RootCause-Blockchain-Security.cmd` | Lanzador de escritorio |
| `packaging/windows/launcher/Generar clave de datos.cmd` | Atajo a `scripts/generate-key.js` |
| `packaging/windows/launcher/LEEME.txt` | Instrucciones para el usuario final |
| `packaging/windows/informacion-antes.txt` | Texto previo del instalador |

`.gitattributes` fuerza CRLF en `.cmd`, `.bat`, `.ps1`, `.iss` y los `.txt` de
empaquetado: `cmd.exe` interpreta mal los bloques multilínea con finales Unix.

---

## Elementos sin uso aparente

**Requiere validación** — cada uno puede ser una extensión prevista o una
sobra. La recomendación individual está en
[15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

| Elemento | Archivo | Consumidores encontrados |
|---|---|---|
| `BitcoinRpcConnector` | `src/services/intelligence-connectors.js` | Ninguno en producción |
| `IntelligenceService.topAlerts` | `src/services/intelligence-service.js` | Ninguno |
| `describeBand` | `src/domain/intelligence/risk-score.js` | Ninguno |
| `isValidAddress` | `src/domain/intelligence/model.js` | Solo `test/intelligence-model.test.js` |
| `makeWalletCluster` | `src/domain/intelligence/model.js` | Solo `test/intelligence-model.test.js` |
| `api.assessmentCacheSeconds` | `config/intelligence-policies.json` | Ninguno: declarado y no leído |

---

## Documentos relacionados

- [05 · Referencia técnica](05-technical-reference.md)
- [06 · Explicación profunda del código](06-deep-code-explanation.md)
- [18 · Guía para un nuevo desarrollador](18-new-developer-guide.md)
<!-- navegacion -->
---

**[← 03 · Arquitectura](03-architecture.md)** · **[Índice](README.md)** · **[05 · Referencia técnica →](05-technical-reference.md)**
