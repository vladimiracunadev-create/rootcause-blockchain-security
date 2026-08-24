# Modelo de datos de RootCause Blockchain Intelligence

Este documento describe el modelo normalizado que produce el dominio de
inteligencia: qué entidades existen, qué campos tiene cada una, cómo se calcula
su clave de deduplicación y —lo más importante— **qué nivel de certeza declara
cada dato**. Está escrito para que alguien pueda discutir una decisión de
modelado sin leer el código, y para que quien lea el código pueda comprobar que
hace exactamente lo que aquí se dice.

Fuente de verdad: `src/domain/intelligence/model.js` (entidades, validación y
claves), `src/domain/intelligence/graph.js` (nodos y aristas),
`src/domain/intelligence/indicators.js` (indicadores),
`src/domain/intelligence/risk-score.js` (evaluación de riesgo) y
`src/services/intelligence-service.js` (alertas, casos, evidencia y estado
persistido). Umbrales y pesos: `config/intelligence-policies.json`. Catálogo:
`config/intelligence-indicators.json`.

## Redes soportadas

`NETWORKS` define **dos** redes y ninguna más. Pedir cualquier otra produce un
error `NETWORK_NOT_SUPPORTED` (HTTP 400) antes de tocar nada.

| Campo | `bitcoin` | `ethereum` |
|---|---|---|
| `id` | `bitcoin` | `ethereum` |
| `name` | Bitcoin | Ethereum |
| `family` | `utxo` | `account` |
| `chainId` | `bitcoin-mainnet` | `1` |
| `nativeAsset` | `BTC` | `ETH` |
| `decimals` | 8 | 18 |
| `addressPrefixes` | `p2pkh: 0x00`, `p2sh: 0x05`, `bech32: "bc"` | — |

La distinción `family` no es decorativa: determina cómo se construye el flujo de
valor. En la familia UTXO el valor va de entradas a salidas dentro de la misma
transacción; en la familia de cuentas, de un emisor a un receptor.

## Los niveles epistémicos

Cada dato del modelo lleva un campo `epistemicLevel`. Es la propiedad central
del producto: separa lo que la cadena dijo de lo que el sistema dedujo.

| Nivel | Significado | Quién lo produce |
|---|---|---|
| `observed-fact` | Lo dijo la fuente y se conserva con su procedencia | `normalizeBlock`, `normalizeTransaction`, `makeEvidence`, registros no marcados, exploits registrados |
| `indicator` | Una regla determinista se activó sobre hechos observados | `makeIndicator`, y las alertas derivadas de él |
| `inference` | Algo derivado combinando hechos | `assessRisk` (el puntaje completo), `findCommunities` |
| `hypothesis` | Agrupación o atribución no confirmada | `makeWalletCluster`, registros marcados (`flagged: true`) |
| `verified-identity` | Identidad de una persona o entidad, confirmada | **Nadie. Nunca.** |

`verified-identity` aparece en la constante `EPISTEMIC_LEVELS` y en ningún otro
sitio del código: no hay una sola línea que lo asigne a una entidad, ni un
endpoint que permita elevar un dato a ese nivel. Está declarado precisamente
para dejar constancia de que es el escalón que este sistema **no** sube. Una
dirección se relaciona con una persona fuera de aquí, con procedimiento legal y
prueba independiente; si esa atribución existe, vive en la cabeza y en el
expediente del analista, no en este modelo.

Nada asciende de categoría por acumulación. Diez indicadores siguen siendo diez
indicadores, no una inferencia; una inferencia repetida no se convierte en un
hecho.

## Validación de direcciones

`normalizeAddress(networkId, value)` es la única puerta de entrada de una
dirección al sistema. Devuelve siempre la forma canónica, de modo que dos
escrituras distintas de la misma dirección no produzcan dos nodos en el grafo.

Rechazos comunes a las dos redes (código `ADDRESS_INVALID`, HTTP 400): valor
vacío, longitud mayor de 128 caracteres, o presencia de espacios o caracteres de
control.

### Ethereum

- Patrón obligatorio: `0x` seguido de exactamente 40 dígitos hexadecimales.
- **Forma canónica: minúsculas.** Se conserva lo recibido en `displayAddress`.
- `kind: "evm"`.
- **Límite declarado:** el checksum EIP-55 *no* se verifica. Una dirección con
  mayúsculas incoherentes se acepta y se normaliza a minúsculas. EIP-55 es una
  comprobación de tecleo, no una identidad distinta, y tratarla como validación
  daría una falsa sensación de garantía.

### Bitcoin

Aquí sí hay verificación criptográfica real, implementada en el propio módulo y
sin dependencias externas, para que «validación estricta de direcciones» sea una
propiedad comprobable y no una promesa:

- **base58check** (`1…` y `3…`): se decodifica el alfabeto base58, se exige una
  longitud de 25 bytes, y se comprueba que los últimos 4 bytes coincidan con los
  primeros 4 del doble SHA-256 de los 21 bytes de carga. `kind`: `p2pkh` para
  las que empiezan por `1`, `p2sh` para las que empiezan por `3`.
- **bech32 y bech32m** (`bc1…`): se comprueba que la cadena no mezcle mayúsculas
  y minúsculas, que su longitud no exceda 90 caracteres, que el HRP sea
  exactamente `bc`, y se calcula el polymod BCH sobre el HRP expandido y los
  datos. La constante esperada depende de la versión de testigo: **1** para la
  versión 0 (segwit v0) y **0x2bc830a3** para las versiones 1 a 16 (bech32m,
  taproot). Cualquier otra versión se rechaza. `kind: "segwit"`, canonizada a
  minúsculas.

Una dirección que pasa el patrón visual pero falla el checksum se rechaza. No
hay modo permisivo.

## Montos: enteros, siempre

Todo monto viaja como **cadena de dígitos decimales que representa un entero en
la unidad mínima del activo** (satoshi, wei, la unidad del token según sus
`decimals`). `normalizeAmount` exige el patrón `^\d{1,78}$` y normaliza los
ceros a la izquierda; cualquier otra cosa produce `AMOUNT_INVALID`.

No se usa coma flotante en ningún punto del pipeline. Las comparaciones se hacen
con `BigInt` (`toBigInt`) y la presentación decimal se calcula con aritmética de
cadenas (`formatAmount`), sin pasar nunca por `Number`. La razón es sencilla: un
redondeo dentro de un análisis forense no es una imprecisión, es un dato falso.

> **Único punto de conversión declarado:** `BitcoinRpcConnector` recibe de
> Bitcoin Core el campo `value` en BTC como número y lo convierte a satoshi con
> un redondeo. Es la frontera con una fuente que ya entrega decimales; a partir
> de ahí el valor es entero. Un dataset local entrega directamente `amountRaw` y
> no atraviesa esa conversión.

## Procedencia: `DataSource`

Ningún hecho entra sin declarar de dónde viene. `normalizeDataSource` produce:

| Campo | Descripción |
|---|---|
| `id` | Identificador de la fuente, hasta 80 caracteres |
| `kind` | Uno de los tipos de la tabla siguiente; cualquier otro valor se degrada a `unknown` |
| `reliability` | Derivada del `kind`, nunca declarada por quien envía el dato |
| `endpoint` | Origen concreto, hasta 200 caracteres |
| `retrievedAt` | Instante de obtención; si falta, el momento de la normalización |

### Fiabilidad por tipo de fuente (`SOURCE_RELIABILITY`)

| `kind` | Fiabilidad | Por qué |
|---|---|---|
| `own-node` | 1,0 | Observación propia: es la referencia |
| `local-dataset` | 0,9 | Fixture reproducible bajo control del operador |
| `indexer` | 0,75 | Un tercero que ya interpretó los datos |
| `explorer` | 0,6 | API pública, sin garantía de integridad |
| `third-party-intel` | 0,5 | Lista de inteligencia importada |
| `unknown` | 0,3 | Todo lo demás, incluido lo que declara un `kind` inexistente |

La fiabilidad no es informativa: **se aplica**. Baja la confianza de los
indicadores construidos sobre esa fuente (`deriveConfidence`), resta puntos en
el modelo de riesgo (`sourceReliabilityPenalty`, hasta 15) y decide si el
análisis puede alcanzar confianza media o alta.

## Entidades

### `Block`

| Campo | Notas |
|---|---|
| `key` | **Deduplicación:** `red:hash` |
| `network`, `height`, `hash` | `height` entero no negativo; `hash` de 32 bytes en hexadecimal, en minúsculas y sin prefijo `0x` |
| `parentHash` | Opcional, mismo formato |
| `timestamp` | ISO 8601 |
| `transactionCount` | Numérico |
| `epistemicLevel` | `observed-fact` |
| `source` | `DataSource` |

Durante una reorganización, el pipeline añade `orphaned: true`, `orphanedAt` y
`replacedBy` al bloque desplazado. No se borra.

### `Transaction`

| Campo | Notas |
|---|---|
| `key` | **Deduplicación:** `red:txid` |
| `txid` | 32 bytes en hexadecimal, minúsculas, sin `0x`; acepta `txid` o `hash` en la entrada |
| `blockHash`, `blockHeight` | Opcionales (`blockHeight` puede ser `null`) |
| `timestamp` | ISO 8601 |
| `feeRaw` | Entero en unidades mínimas; `"0"` si no se declara |
| `inputs`, `outputs`, `transfers` | Como máximo 2000 elementos cada uno |
| `contractAddress`, `method` | Opcionales; `method` hasta 60 caracteres |
| `epistemicLevel` | `observed-fact` |
| `source` | `DataSource` |

Una transacción huérfana recibe `orphaned: true` y `orphanedAt`.

**`inputs[]`** (familia UTXO): `index`, `address` o `null`, `amountRaw`,
`previousTxid`, `previousIndex`, `coinbase`.

**`outputs[]`** (familia UTXO): `index`, `address` o `null`, `amountRaw`,
`spent`, `scriptType`.

**`transfers[]`** (ambas familias, y lo único sobre lo que se construye el
grafo): `index`, `from`, `to`, `amountRaw`, `asset`, `assetContract`,
`decimals`, `kind`. Exige al menos uno de `from` o `to`.

Si la transacción no trae `transfers` pero sí entradas o salidas, se derivan:
por cada salida se crea una transferencia desde la primera entrada con
dirección, con `kind: "utxo-derived"`, o `kind: "coinbase"` si no hay ninguna
entrada con dirección. **Esto es una atribución estructural, no un hecho
observado**: la cadena no dice qué entrada financió qué salida concreta. El
`kind` es la marca que permite distinguir después esas aristas de una
transferencia declarada explícitamente por la fuente.

### Dirección normalizada

No se persiste como entidad propia: es el resultado de `normalizeAddress`
(`{ network, address, displayAddress, kind }`) y, ya en el grafo, un **nodo**
con `key`, `network`, `address`, `firstSeen`, `lastSeen`, `receivedRaw`,
`sentRaw`, `inDegree`, `outDegree` y `transactionCount`. Los totales del nodo se
acumulan como `BigInt` y se serializan como cadena.

**Clave canónica de dirección:** `addressKey(red, dirección)` → `red:dirección`,
con la dirección ya normalizada.

### `WalletCluster`

Producido por `makeWalletCluster`: `id` (`stableId`), `network`, `members`
(únicos y ordenados), `size`, `heuristic` (por defecto
`common-input-ownership`), `confidence` (por defecto `low`), `createdAt`, un
`caveat` fijo y `epistemicLevel: "hypothesis"` **sin excepción**. No existe un
parámetro para elevarlo.

> **Estado real:** la función está implementada y cubierta por pruebas, pero
> **ningún endpoint ni caso de uso del servicio produce clusters hoy**. Lo que
> sí se expone es `GET /api/v1/intelligence/communities`, que devuelve
> componentes conexos (`epistemicLevel: "inference"`) — la agrupación más
> conservadora posible: dice que hay transferencias entre esas direcciones, no
> que tengan el mismo dueño.

### Contratos, tokens y direcciones del registro local

`normalizeContractRecord` cubre las tres colecciones del registro
(`contracts`, `drainers`, `bridges`):

| Campo | Notas |
|---|---|
| `key` | **Deduplicación:** `addressKey` → `red:dirección`. Registrar dos veces la misma clave **reemplaza** el registro anterior |
| `network`, `address` | Normalizados |
| `label`, `category`, `flagReason` | Texto, hasta 120 / 40 / 200 caracteres |
| `flagged` | Booleano. En `drainers` se fuerza a `true` |
| `confidence` | `low`, `medium` (por defecto) o `high` |
| `epistemicLevel` | `hypothesis` si `flagged`, `observed-fact` si no |
| `source` | `DataSource` |

Esa asimetría es deliberada: registrar que una dirección existe con una etiqueta
es un hecho local; **marcarla** es una hipótesis del operador. La marca procede
siempre del registro local y nunca de un servicio remoto de reputación —
consultarlo filtraría al proveedor qué se está investigando.

Los `exploits` tienen forma propia: `id` (`stableId("exploit", red, dirección,
occurredAt)`), `network`, `address`, `label` (obligatorio), `occurredAt`,
`description`, `registeredAt`, `epistemicLevel: "observed-fact"` y una `source`
fija `local-dataset` / `operator-registry` con fiabilidad 0,9.

El modelo no distingue «token» de «contrato» con una entidad aparte: un token se
registra como contrato con su `category`, y los activos aparecen en cada
transferencia mediante `asset`, `assetContract` y `decimals`.

### `RiskIndicator`

| Campo | Notas |
|---|---|
| `id` | **Deduplicación:** `stableId("indicator", códigoDelCatálogo, subject, discriminator)` |
| `indicator`, `family`, `title`, `description` | Copiados del catálogo |
| `severity` | Del catálogo (`critical`, `high`, `medium`, `low`) |
| `confidence` | Derivada: parte del `defaultConfidence` del catálogo, sube un escalón si la señal es fuerte, baja uno si la fiabilidad de la fuente es menor de 0,5 y cae a `low` si es menor de 0,35 |
| `epistemicLevel` | `indicator` |
| `network`, `subject` | `subject` es siempre una clave `red:dirección` |
| `explanation` | Frase en español con los números concretos que activaron la regla |
| `evidence` | Objeto propio de cada detector, con los valores medidos |
| `relatedTransactions` | Hasta 50 `txid` |
| `thresholdsApplied` | Los umbrales exactos usados, copiados de la política |
| `falsePositives` | Lista del catálogo: cómo podría ser un falso positivo |
| `recommendedAction` | Qué comprobar antes de escalar |
| `source` | Agregada: el `kind` de todas las fuentes implicadas y **la menor** fiabilidad entre ellas |
| `detectedAt` | Instante de evaluación |

El `discriminator` es lo que evita que dos episodios distintos del mismo patrón
sobre el mismo sujeto colapsen en un solo indicador: por ejemplo, la dirección
sospechosa en address poisoning o el identificador del exploit.

Un indicador no afirma culpabilidad, no atribuye identidad y no concluye nada.
Dice que un patrón reproducible aparece en unos hechos, con qué confianza, y
cómo podría estar equivocado.

### `RiskAssessment`

Producido por `assessRisk` y enriquecido por el servicio. **No se persiste**: se
calcula en cada consulta. El estado declara un array `assessments` que hoy
permanece vacío.

Campos del dominio: `subject`, `network`, `score` (0 a 100), `band` y
`bandLabel`, `confidence` del análisis, `modelVersion`, `evaluatedAt`,
`epistemicLevel: "inference"`, `summary`, `factorsIncreasing`,
`factorsDecreasing`, `indicatorCount`, `distinctIndicators`,
`sourceReliability`, `limitations`, `requiresHumanReview` (constante `true`) y
`recommendation`.

El servicio añade `observed` (actividad del nodo en el grafo, o `null`),
`indicators` (los indicadores del sujeto con su evidencia y sus falsos
positivos), `proximity` (distancia, vía, truncamiento y su advertencia) y
`dataScope` (`transactionsAnalyzed`, `orphanedExcluded`, `lastIngestAt`).

Cada factor lleva `id`, `label`, `points`, `weight` con el desglose del cálculo,
`detail` y su propio `epistemicLevel`. **No existe ninguna vía para obtener el
número sin su explicación.**

### `Alert`

| Campo | Notas |
|---|---|
| `id` | **Deduplicación:** `stableId("alert", id del indicador)` |
| `indicatorHitId` | El indicador que la originó; es la clave que evita duplicados en cada análisis |
| `indicator`, `title`, `subject`, `network`, `severity`, `confidence`, `explanation` | Copiados del indicador |
| `epistemicLevel` | `indicator` |
| `status` | `new`, `in-review`, `confirmed`, `false-positive`, `mitigated`, `closed` |
| `assignedTo`, `caseId` | Opcionales |
| `createdAt`, `lastSeenAt` | Un indicador que vuelve a activarse actualiza `lastSeenAt`; no crea una alerta nueva |
| `history[]` | `at`, `actor`, `from`, `to`, `note`, `assignedTo` |
| `falsePositiveReason`, `falsePositiveAt` | Solo si el estado pasó a `false-positive` |

### `InvestigationCase`

| Campo | Notas |
|---|---|
| `id` | **Deduplicación:** `stableId("case", título, instante de apertura)` |
| `title`, `summary` | Hasta 160 / 600 caracteres; `title` obligatorio |
| `status` | `open`, `in-review`, `closed` |
| `priority` | `low`, `medium` (por defecto), `high`, `critical` |
| `assignedTo` | Opcional |
| `alertIds`, `evidenceIds` | Hasta 100 alertas por operación |
| `notes[]`, `decisions[]` | Cada entrada con `at`, `actor` y su texto |
| `timeline[]` | `case-opened`, `note-added`, `decision-recorded`, `status-changed`, `evidence-attached` |
| `openedAt`, `updatedAt`, `closedAt` | `closedAt` se rellena al cerrar |

### `Evidence`

| Campo | Notas |
|---|---|
| `id` | **Deduplicación:** `stableId("evidence", kind, contentHash)`. Adjuntar dos veces el mismo contenido no duplica la evidencia |
| `kind`, `description` | Hasta 40 / 400 caracteres; `kind` obligatorio |
| `payload` | El contenido tal cual, o `null` |
| `contentHash` | SHA-256 de `JSON.stringify(payload)`, calculado **al crearla** |
| `algorithm` | `sha256` |
| `source`, `collectedBy`, `collectedAt` | Procedencia y autoría |
| `epistemicLevel` | `observed-fact` |
| `immutable` | `true` |

`verifyEvidence` recalcula el hash y devuelve `{ valid, expected, actual }`. No
existe ninguna operación de edición de evidencia en el servicio ni en la API:
solo añadir y verificar.

### Nodos y aristas del grafo

Se construyen en memoria a partir de las transacciones activas; no se persisten.

- **Nodo** = una dirección (ver más arriba).
- **Arista** = una transferencia observada: `from`, `to`, `network`,
  `amountRaw`, `asset`, `assetContract`, `decimals`, `txid`, `transferIndex`,
  `blockHeight`, `timestamp`, `kind`. Su identidad interna es
  `txid|transferIndex|from|to`.

Los recorridos son deterministas: las listas de adyacencia se ordenan por
`timestamp` y, a igualdad, por esa identidad. Mismo grafo, mismo resultado.

### Reutilización de la auditoría existente

El dominio de inteligencia **no tiene su propio registro de auditoría**: escribe
en la misma cadena encadenada del producto (`src/infrastructure/audit-log.js`),
que enlaza cada entrada con el hash SHA-256 de la anterior y arranca en
`GENESIS`. Cada entrada lleva `id`, `occurredAt`, `actor`, `action`,
`entityType`, `entityId`, `metadata` redactada y `previousHash`.

Acciones que registra este dominio: `intelligence_ingest_completed`,
`intelligence_registry_updated`, `intelligence_exploit_registered`,
`intelligence_analysis_completed`, `intelligence_alert_updated`,
`intelligence_case_opened`, `intelligence_case_updated` y
`intelligence_evidence_attached`. Se verifican con el mismo
`GET /api/audit` que el resto del producto.

## Resumen de claves de deduplicación

| Entidad | Clave | Efecto de repetir |
|---|---|---|
| Bloque | `red:hash` | Se cuenta como duplicado y se descarta |
| Transacción | `red:txid` | Se cuenta como duplicada y se descarta |
| Dirección | `red:dirección` normalizada | Un solo nodo en el grafo |
| Registro local | `red:dirección` | Reemplaza el registro anterior |
| Exploit | `stableId("exploit", red, dirección, occurredAt)` | No se añade dos veces |
| Indicador | `stableId("indicator", código, subject, discriminator)` | Un solo indicador |
| Alerta | `stableId("alert", id del indicador)` | Se actualiza `lastSeenAt` |
| Caso | `stableId("case", título, apertura)` | Casos con el mismo título en el mismo instante colisionarían; en la práctica el instante los separa |
| Evidencia | `stableId("evidence", kind, contentHash)` | No se duplica |

`stableId(prefijo, ...partes)` es `prefijo-` seguido de los 20 primeros
caracteres del SHA-256 de las partes unidas por `|`.

## Documentos relacionados

- Gobierno del dato, retención y política de no atribución:
  [`DATA-GOVERNANCE.md`](DATA-GOVERNANCE.md).
- Flujo de trabajo del analista: [`INVESTIGATION-GUIDE.md`](INVESTIGATION-GUIDE.md).
- Reglas preventivas `BLK-*`, que son un catálogo distinto:
  [`HEURISTICAS.md`](HEURISTICAS.md).
