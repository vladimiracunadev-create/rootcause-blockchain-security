# 19 · Matriz de trazabilidad

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

Permite seguir una funcionalidad desde la interfaz hasta el mecanismo de
persistencia y sus pruebas, en ambas direcciones.

**Nota sobre la columna «Persistencia»:** no hay base de datos. Se indica la
**clave del estado** donde vive el dato. Ver [07 · Persistencia](07-database.md).

**Estado de validación**

| Marca | Significado |
|---|---|
| **Verificado** | Se ejecutó una prueba o un gate que lo confirma |
| **Verificado (lectura)** | Se comprobó leyendo el código; no hay prueba dedicada |
| **Requiere validación** | Necesita confirmación humana |

---

## Funcionalidades de defensa

| Funcionalidad | Regla de negocio | Interfaz / endpoint | Módulo | Función o clase | Persistencia | Prueba | Documento | Estado |
|---|---|---|---|---|---|---|---|---|
| Registrar proyecto | Único por (nombre, familia, chainId); direcciones únicas dentro del proyecto | Vista Inventario · `POST /api/projects` | `src/services/defense-service.js` | `normalizeProject`, `DefenseService.addProject` | `state.projects[]` | `test/api.test.js`, gate de seguridad | [09](09-apis-and-integrations.md) | **Verificado** |
| Registrar cuenta vigilada | `projectId` debe existir; única por (dirección, chainId); sin datos personales | Vista Wallet · `POST /api/accounts` | `src/services/defense-service.js` | `normalizeWatchedAccount`, `addWatchedAccount` | `state.watchedAccounts[]` | Gate: «cuenta pública vigilada aceptada» y dos rechazos | [07](07-database.md) | **Verificado** |
| Observar evento de proyecto | Tipo en `EVENT_TYPES`; el proyecto debe existir | `POST /api/observe/event` | `src/services/defense-service.js` | `observeEvent` | `state.observedEvents[]` | `test/api.test.js` | [08](08-data-flow.md) | **Verificado** |
| Observar evento wallet | `transactionHash` obligatorio; idempotente por (chainId, txHash, logIndex); la cuenta debe estar vigilada | `POST /api/observe/event` | `src/services/defense-service.js` | `normalizeWalletEvent`, `observeWalletEvent` | `state.walletEvents[]` | Gate: «evento wallet idempotente…» | [08](08-data-flow.md) | **Verificado** |
| Aprobar hash de cambio | SHA-256 válido; sin duplicados | `POST /api/approvals` | `src/services/defense-service.js` | `approvePolicyHash` | `state.approvals[]` | `test/api.test.js` | [09](09-apis-and-integrations.md) | **Verificado** |
| Ejecutar análisis | Evaluación pura del estado + fusión con el ciclo de vida | Botón «Ejecutar análisis» · `POST /api/scan` | `src/domain/rule-engine.js`, `src/services/defense-service.js` | `evaluateState`, `mergeIncidents`, `scan` | `state.incidents[]` | `test/rule-engine.test.js`, `test/wallet-rules.test.js` | [06](06-deep-code-explanation.md) | **Verificado** |
| Ciclo de vida del incidente | Reaparece → conserva `createdAt`; `acknowledged` sobrevive; ausencia → `resolved` | Vista Incidentes · `PATCH /api/incidents/{id}` | `src/services/defense-service.js` | `mergeIncidents`, `updateIncident` | `state.incidents[]` | Indirecta vía `test/api.test.js` | [06](06-deep-code-explanation.md) | **Verificado (lectura)** |
| Refrescar observador | Allowlist de solo lectura; endpoint local por defecto | Botón «Actualizar RPC» · `POST /api/node/refresh` | `src/infrastructure/evm-rpc.js` | `EvmRpcClient.snapshot`, `refreshNode` | `state.node` | `test/evm-rpc.test.js`, gate | [09](09-apis-and-integrations.md) | **Verificado** |
| Puntaje de postura | Máximo + 8 % por hallazgo adicional, tope 100 | Vista Postura · `GET /api/summary` | `src/domain/risk.js` | `riskScore`, `riskLevel`, `countBySeverity` | Calculado, no persistido | Indirecta | [05](05-technical-reference.md) | **Verificado (lectura)** |
| Resumen de postura de wallets | Contadores sobre proyecciones e incidentes abiertos | Vista Wallet · `GET /api/summary` | `src/domain/wallet-rules.js` | `walletPostureSummary` | Calculado | `test/wallet-rules.test.js` | [05](05-technical-reference.md) | **Verificado** |
| Consultar catálogo de controles | 13 controles, cada regla en exactamente uno | Vista Controles · `GET /api/controls` | `config/control-catalog.json` | `controlsCatalog` | Configuración | `scripts/check-rule-coverage.js` | [05](05-technical-reference.md) | **Verificado** |
| Verificar auditoría | Cadena de hashes; detecta modificación y borrado intermedio | `GET /api/audit` | `src/infrastructure/audit-log.js` | `appendAuditEntry`, `verifyAuditChain` | `state.audit[]` | `test/audit-log.test.js`, gate | [11](11-security.md) | **Verificado** |
| Persistir estado cifrado | AES-256-GCM; escritura atómica; `0600`/`0700` | — | `src/infrastructure/encrypted-store.js` | `EncryptedFileStore`, `encryptJson`, `decryptJson` | `data/state.enc.json` | `test/encrypted-store.test.js` | [07](07-database.md) | **Verificado** |
| Rechazar material secreto | Por nombre de campo y por patrón de contenido | Todos los endpoints de escritura | `src/domain/secret-guard.js` | `assertNoSecretMaterial` | — | `test/secret-guard.test.js` + 7 invariantes | [11](11-security.md) | **Verificado** |
| Vigilancia periódica | Guarda de reentrada; los errores no derriban el proceso | `WATCHTOWER_ENABLED=true` | `src/services/watchtower.js` | `Watchtower` | Indirecta | **Ninguna** | [03](03-architecture.md) | **Requiere validación** |
| Apertura del navegador | Solo con `ROOTCAUSE_OPEN_BROWSER=1` **y** bind loopback | Lanzador de escritorio | `src/server.js` | `openBrowserIfRequested` | — | `test/desktop-launch.test.js` | [06](06-deep-code-explanation.md) | **Verificado** |

---

## Reglas `BLK-*` · trazabilidad completa

Todas se emiten con `makeFinding`, se fusionan con `mergeIncidents`, se guardan
en `state.incidents[]` y se muestran en la vista Incidentes. La especificación
exacta está en [`../HEURISTICAS.md`](../HEURISTICAS.md).

La columna «Escenario demo» se verificó **ejecutando** el estado de
demostración y recogiendo los códigos realmente emitidos: 19 de los 22.

| Código | Control | Módulo | Función | Prueba | Escenario demo |
|---|---|---|---|---|---|
| `BLK-CONTRACT-001` | `SC-PROVENANCE` | `src/domain/rule-engine.js` | `evaluateProject` | `test/rule-engine.test.js` | Sí |
| `BLK-ACCESS-001` | `ADMIN-CONTAINMENT` | `src/domain/rule-engine.js` | `evaluateProject` | `test/rule-engine.test.js` | Sí |
| `BLK-ACCESS-002` | `ADMIN-CONTAINMENT` | `src/domain/rule-engine.js` | `evaluateProject` | **Ninguna** | **No** |
| `BLK-UPGRADE-001` | `ADMIN-CONTAINMENT` | `src/domain/rule-engine.js` | `evaluateProject` | `test/rule-engine.test.js` | Sí |
| `BLK-ORACLE-001` | `ORACLE-RESILIENCE` | `src/domain/rule-engine.js` | `evaluateProject` | `test/rule-engine.test.js` | Sí |
| `BLK-ORACLE-002` | `ORACLE-RESILIENCE` | `src/domain/rule-engine.js` | `evaluateProject` | `test/rule-engine.test.js` | Sí |
| `BLK-BRIDGE-001` | `BRIDGE-QUORUM` | `src/domain/rule-engine.js` | `evaluateProject` | `test/rule-engine.test.js` | Sí |
| `BLK-GOV-001` | `GOVERNANCE-DELAY` | `src/domain/rule-engine.js` | `evaluateProject` | `test/rule-engine.test.js` | Sí |
| `BLK-SUPPLY-001` | `SUPPLY-CHAIN` | `src/domain/rule-engine.js` | `evaluateProject` | `test/rule-engine.test.js` | Sí |
| `BLK-EVENT-001` | `CHANGE-APPROVAL` | `src/domain/rule-engine.js` | `evaluateEvent` | `test/rule-engine.test.js` | Sí |
| `BLK-FUNDS-001` | `VALUE-EGRESS` | `src/domain/rule-engine.js` | `evaluateEvent` | `test/rule-engine.test.js` | Sí |
| `BLK-NODE-001` | `OBSERVER-INTEGRITY` | `src/domain/rule-engine.js` | `evaluateNode` | `test/rule-engine.test.js` | No — el nodo de la demo está conectado |
| `BLK-NODE-002` | `OBSERVER-INTEGRITY` | `src/domain/rule-engine.js` | `evaluateNode` | `test/rule-engine.test.js` | No — el chain ID de la demo coincide |
| `BLK-NODE-003` | `OBSERVER-INTEGRITY` | `src/domain/rule-engine.js` | `evaluateNode` | `test/rule-engine.test.js` | Sí (retraso de 14 bloques) |
| `BLK-WALLET-001` | `WALLET-ALLOWANCE` | `src/domain/wallet-rules.js` | `checkAllowanceRules` | `test/wallet-rules.test.js` (positiva + negativa) | Sí |
| `BLK-WALLET-002` | `WALLET-COUNTERPARTY` | `src/domain/wallet-rules.js` | `checkAllowanceRules` | `test/wallet-rules.test.js` | Sí |
| `BLK-WALLET-003` | `WALLET-ALLOWANCE` | `src/domain/wallet-rules.js` | `checkOperatorRules` | `test/wallet-rules.test.js` | Sí |
| `BLK-WALLET-004` | `WALLET-ALLOWANCE` | `src/domain/wallet-rules.js` | `checkPermitRules` | `test/wallet-rules.test.js` | Sí |
| `BLK-WALLET-005` | `WALLET-COUNTERPARTY` | `src/domain/wallet-rules.js` | `checkPoisoningRules` | `test/wallet-rules.test.js` | Sí |
| `BLK-WALLET-006` | `SMART-ACCOUNT-INTEGRITY` | `src/domain/wallet-rules.js` | `checkSmartAccountRules` | `test/wallet-rules.test.js` (4 casos) | Sí |
| `BLK-WALLET-007` | `SMART-ACCOUNT-INTEGRITY` | `src/domain/wallet-rules.js` | `checkDelegationRules` | `test/wallet-rules.test.js` (3 casos) | Sí |
| `BLK-WALLET-008` | `WALLET-ACTIVITY` | `src/domain/wallet-rules.js` | `checkActivityRules` (4 sub-causas) | `test/wallet-rules.test.js` (5 casos) | Sí |

**Verificación de la fila completa:**

~~~bash
node scripts/check-rule-coverage.js
~~~

Comprueba que cada código está en el motor, en el catálogo, en la política y en
el README. Para las ocho reglas de wallet, la columna «Escenario demo» la
verifica además la prueba «demo state produces every wallet rule exactly once and
a healthy account».

> **Hueco detectado.** `BLK-ACCESS-002` —multisig administrativo con umbral
> débil— **no tiene ninguna prueba ni ningún escenario de demostración**. Es la
> única de las 22 reglas en esa situación: los códigos de nodo que la demo no
> activa sí están cubiertos por `test/rule-engine.test.js`. Registrado como R-25
> en [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

---

## Funcionalidades de inteligencia

| Funcionalidad | Regla de negocio | Endpoint | Módulo | Función | Persistencia | Prueba | Documento | Estado |
|---|---|---|---|---|---|---|---|---|
| Ingerir bloques y transacciones | Idempotente por `network:hash`; reorganización marca, no borra | `POST /api/v1/intelligence/ingest` | `src/services/intelligence-service.js` | `ingest` | `intelligence.blocks[]`, `.transactions[]`, `.ingestion` | `test/intelligence-pipeline.test.js` | [06](06-deep-code-explanation.md) | **Verificado** |
| Ingerir dataset | Identificador restringido + comprobación de ruta resuelta | `POST /api/v1/intelligence/ingest/dataset` | `src/services/intelligence-datasets.js` | `loadDataset`, `ingestDataset` | Ídem | Gate: «el cargador de datasets rechaza el path traversal» | [11](11-security.md) | **Verificado** |
| Ingerir desde conector | Solo lectura; reintentos; límite de ritmo | `POST /api/v1/intelligence/ingest/connector` | `src/services/intelligence-connectors.js` | `ConnectorRegistry`, `BaseConnector.run` | Ídem | Parcial vía pipeline | [09](09-apis-and-integrations.md) | **Verificado (lectura)** |
| Evaluar indicadores | Determinista; sin huérfanas; textos del catálogo | `POST /api/v1/intelligence/analyze` | `src/domain/intelligence/indicators.js` | `evaluateIndicators` | `intelligence.indicators[]`, `.alerts[]` | `test/intelligence-indicators.test.js` | [06](06-deep-code-explanation.md) | **Verificado** |
| Puntuar riesgo | Nunca sin factores, confianza, limitaciones y revisión humana | `GET /api/v1/risk/addresses/{red}/{dir}` | `src/domain/intelligence/risk-score.js` | `assessRisk`, `IntelligenceService.assess` | Calculado, no persistido | Gate: «el puntaje nunca viaja sin explicación…» | [11](11-security.md) | **Verificado** |
| Análisis previo de transacción | Siempre `advisory-only`; no autoriza ni bloquea | `POST /api/v1/risk/transactions` | `src/services/intelligence-service.js` | `assessTransactionIntent` | — | Gate: «el análisis previo de transacción es consultivo» | [09](09-apis-and-integrations.md) | **Verificado** |
| Recorrer el grafo | Cotas obligatorias; declara truncado y motivo | `GET /api/v1/intelligence/graph/{red}/{dir}` | `src/domain/intelligence/graph.js` | `buildFundsGraph`, `traverse` | Calculado | `test/intelligence-graph.test.js`, gate | [06](06-deep-code-explanation.md) | **Verificado** |
| Caminos entre direcciones | Caminos simples, acotados | `GET /api/v1/intelligence/paths` | `src/domain/intelligence/graph.js` | `findPaths` | Calculado | `test/intelligence-graph.test.js` | [06](06-deep-code-explanation.md) | **Verificado** |
| Ciclos | Firma canónica para deduplicar | `GET /api/v1/intelligence/cycles` | `src/domain/intelligence/graph.js` | `detectCycles` | Calculado | `test/intelligence-graph.test.js` | [06](06-deep-code-explanation.md) | **Verificado** |
| Comunidades | Componentes conexos; nunca titularidad | `GET /api/v1/intelligence/communities` | `src/domain/intelligence/graph.js` | `findCommunities` | Calculado | `test/intelligence-graph.test.js` | [06](06-deep-code-explanation.md) | **Verificado** |
| Ciclo de vida de la alerta | 6 estados; todo cambio queda en `history`; el falso positivo guarda su motivo | `PATCH /api/v1/intelligence/alerts/{id}` | `src/services/intelligence-service.js` | `updateAlert` | `intelligence.alerts[]` | `test/intelligence-pipeline.test.js` | [09](09-apis-and-integrations.md) | **Verificado** |
| Caso de investigación | Notas y decisiones quedan en `timeline` | `POST` y `PATCH /api/v1/intelligence/cases` | `src/services/intelligence-service.js` | `openCase`, `updateCase` | `intelligence.cases[]` | `test/intelligence-pipeline.test.js` | [09](09-apis-and-integrations.md) | **Verificado** |
| Adjuntar evidencia | Se sella con hash al crearse; no hay operación de edición | `POST /api/v1/intelligence/cases/{id}/evidence` | `src/domain/intelligence/model.js` | `makeEvidence`, `attachEvidence` | `intelligence.evidence[]` | `test/intelligence-pipeline.test.js` | [07](07-database.md) | **Verificado** |
| Verificar evidencia | Recalcula el hash y lista lo manipulado | `GET /api/v1/intelligence/evidence/verify` | `src/domain/intelligence/model.js` | `verifyEvidence`, `verifyEvidenceIntegrity` | Lectura | `test/intelligence-pipeline.test.js` | [11](11-security.md) | **Verificado** |
| Informe de caso | Incluye aviso epistémico y limitaciones **dentro** del informe | `GET /api/v1/intelligence/cases/{id}/report` | `src/services/intelligence-service.js` | `caseReport` | Lectura | `test/intelligence-pipeline.test.js` | [06](06-deep-code-explanation.md) | **Verificado** |
| Registro local de marcado | Nunca se consulta fuera | `POST /api/v1/intelligence/registry/{tipo}` | `src/domain/intelligence/model.js` | `normalizeContractRecord`, `registerLocalRecord` | `intelligence.registries` | `test/intelligence-pipeline.test.js`, gate | [08](08-data-flow.md) | **Verificado** |
| Registro de exploit | Contextualiza `INT-EXPLOIT-001` | `POST /api/v1/intelligence/exploits` | `src/services/intelligence-service.js` | `registerExploit` | `intelligence.registries.exploits[]` | `test/intelligence-pipeline.test.js` | [09](09-apis-and-integrations.md) | **Verificado** |
| Validar direcciones | Checksum real base58check y bech32/bech32m | Toda entrada de inteligencia | `src/domain/intelligence/model.js` | `normalizeAddress` | — | `test/intelligence-model.test.js` (con casos negativos) | [06](06-deep-code-explanation.md) | **Verificado** |

---

## Indicadores `INT-*` · trazabilidad

Todos se emiten desde `evaluateIndicators` en
`src/domain/intelligence/indicators.js`, se guardan en
`intelligence.indicators[]`, generan una alerta en `intelligence.alerts[]` y se
muestran en la vista Intelligence. La especificación exacta está en
[`../ONCHAIN-ANALYTICS.md`](../ONCHAIN-ANALYTICS.md).

| Código | Familia | Detector | Dataset de prueba |
|---|---|---|---|
| `INT-FLOW-001` | `INT-FLOW` | `detectFanIn` | `examples/datasets/02-fan-in.json` |
| `INT-FLOW-002` | `INT-FLOW` | `detectFanOut` | `examples/datasets/03-fan-out.json` |
| `INT-FLOW-003` | `INT-FLOW` | `detectRapidHops` | `examples/datasets/05-transferencias-rapidas.json` |
| `INT-FLOW-004` | `INT-FLOW` | `detectPeelingChain` | `examples/datasets/04-peeling-chain.json` |
| `INT-BEHAV-001` | `INT-BEHAV` | `detectSuddenActivity` | Prueba unitaria |
| `INT-BEHAV-002` | `INT-BEHAV` | `detectStructuring` | Prueba unitaria |
| `INT-BEHAV-003` | `INT-BEHAV` | `detectCoordination` | Prueba unitaria |
| `INT-BEHAV-004` | `INT-BEHAV` | `detectBehaviourChange` | Prueba unitaria |
| `INT-EXPO-001` | `INT-EXPO` | `detectFlaggedExposure` | `examples/datasets/07-contrato-marcado.json` |
| `INT-EXPO-002` | `INT-EXPO` | `detectAddressPoisoning` | `examples/datasets/06-address-poisoning.json` |
| `INT-EXPO-003` | `INT-EXPO` | `detectUnlimitedApproval` | `examples/datasets/08-drainer-simulado.json` |
| `INT-EXPO-004` | `INT-EXPO` | `detectFlaggedExposure` | `examples/datasets/08-drainer-simulado.json` |
| `INT-ASSET-001` | `INT-ASSET` | `detectAssetConcentration` | `examples/datasets/02-fan-in.json` |
| `INT-BRIDGE-001` | `INT-BRIDGE` | `detectBridgeChaining` | Prueba unitaria |
| `INT-EXPLOIT-001` | `INT-EXPLOIT` | `detectPostExploitMovement` | `examples/datasets/09-post-exploit.json` |

Dos datasets merecen mención aparte:

- `examples/datasets/01-actividad-normal.json` declara `expected.indicators`
  **vacío**: es el escenario negativo puro, y comprueba que el motor **no** grita
  donde no debe.
- `examples/datasets/10-falso-positivo.json` **sí** activa `INT-FLOW-001` e
  `INT-ASSET-001`. No es un error: es un escenario en el que los indicadores se
  disparan sobre actividad legítima, para practicar el triaje y el registro del
  falso positivo con su motivo. Es la diferencia entre «el motor no debe
  activarse» y «el motor se activa, y la persona decide».

**Verificación:**

~~~bash
node scripts/check-rule-coverage.js
~~~

Comprueba que cada indicador tiene umbral, familia existente, al menos dos falsos
positivos, acción recomendada y documentación —y que ningún umbral apunta a un
indicador inexistente.

---

## Invariantes de seguridad · trazabilidad

| Invariante | Módulo que lo garantiza | Quién lo verifica | Documento |
|---|---|---|---|
| No se aceptan claves ni credenciales | `assertNoSecretMaterial` | `scripts/check-security-claims.js` (7 comprobaciones) | [11](11-security.md) |
| El RPC es de solo lectura | `READ_ONLY_METHODS` | Gate + `grep` en `ci.yml` | [11](11-security.md) |
| El RPC remoto está deshabilitado por defecto | `validateEndpoint` | Gate | [10](10-configuration.md) |
| No hay dependencias de terceros | — | `scripts/check-local-only.js` + comprobación independiente en CI | [01](01-system-overview.md) |
| El panel no carga nada externo | CSP + `STATIC_FILES` | `scripts/check-local-only.js` | [11](11-security.md) |
| La CSP no se relaja | `applySecurityHeaders` | `scripts/check-local-only.js` | [11](11-security.md) |
| No es una wallet: no conecta, no firma, no revoca | Ausencia de la capacidad | Gate: estático sobre `src/**` + runtime sobre el panel | [11](11-security.md) |
| Toda mutación exige la cabecera local | `validateMutationRequest` | Gate | [11](11-security.md) |
| El puntaje nunca viaja solo | `assessRisk` | Gate | [11](11-security.md) |
| El análisis previo es consultivo | `assessTransactionIntent` | Gate | [09](09-apis-and-integrations.md) |
| El grafo aplica sus cotas | `bound` en `graph.js` | Gate | [06](06-deep-code-explanation.md) |
| No hay listas remotas de reputación | Registros locales | Gate | [08](08-data-flow.md) |
| La cadena de auditoría es íntegra | `appendAuditEntry` | Gate + `test/audit-log.test.js` | [11](11-security.md) |
| Motor, catálogo, política y README coherentes | — | `scripts/check-rule-coverage.js` | [12](12-testing-and-quality.md) |
| Ningún documento enlaza a un archivo inexistente | — | `scripts/check-docs.js` | [12](12-testing-and-quality.md) |
| El artefacto empaquetado arranca con contenido | — | Job `app-windows` de `ci.yml` | [13](13-deployment-and-operations.md) |

---

## Vistas del panel · trazabilidad inversa

| Vista | Datos que consume | Endpoint | Funciones de `src/web/static/app.js` |
|---|---|---|---|
| Postura | riesgo, totales, ruta causal, nodo | `GET /api/summary` | `renderRisk`, `renderCausalFlow`, `renderNode` |
| Incidentes | incidentes con evidencia y remediación | `GET /api/summary` | `renderIncidents`, `incidentTemplate`, `showIncident` |
| Wallet Posture | `walletPosture`, cuentas, incidentes `BLK-WALLET-*` | `GET /api/summary` | `renderWallet`, `accountTemplate`, `walletIncidents` |
| Intelligence | resumen, alertas, casos, evaluación, grafo | `GET /api/v1/intelligence/*` | `renderIntelligence`, `renderAssessment`, `renderGraph`, `alertTemplate`, `factorTemplate`, `evaluateAddress` |
| Inventario | proyectos y contratos | `GET /api/summary` | `renderProjects`, `projectTemplate` |
| Controles | catálogo de los 13 controles | `GET /api/controls` | `renderControls` |

---

## Huecos de trazabilidad detectados

**Requiere validación** — elementos sin cobertura completa en la cadena
funcionalidad → código → prueba:

| Elemento | Hueco | Referencia |
|---|---|---|
| `Watchtower` | Sin ninguna prueba | R-17 |
| `mergeIncidents` | Sin prueba directa, pese a gobernar el ciclo de vida completo | R-17 |
| `assessRisk` | Sin prueba unitaria dedicada | R-17 |
| `withRetry`, `isRetryable`, `RateLimiter` | Sin prueba directa | R-17 |
| `escapeHtml` y el resto del panel | Sin ninguna prueba | R-17 |
| `BitcoinRpcConnector` | Implementado, sin ruta que lo alcance | R-19 |
| `topAlerts`, `describeBand` | Implementados, sin consumidor | R-19 |
| `intelligence.assessments[]` | Campo declarado en el que nunca se escribe | R-13 |
| `api.assessmentCacheSeconds`, `api.maximumAddressesPerRequest` | Configuración declarada y no leída | R-13 |
| `schemaVersion` | Presente y nunca comprobado | R-14 |

El detalle de cada uno está en
[15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

---

## Documentos relacionados

- [05 · Referencia técnica](05-technical-reference.md)
- [12 · Pruebas y calidad](12-testing-and-quality.md)
- [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md)
- [`../HEURISTICAS.md`](../HEURISTICAS.md)
- [`../ONCHAIN-ANALYTICS.md`](../ONCHAIN-ANALYTICS.md)
<!-- navegacion -->
---

**[← 18 · Guía para un nuevo desarrollador](18-new-developer-guide.md)** · **[Índice](README.md)**
