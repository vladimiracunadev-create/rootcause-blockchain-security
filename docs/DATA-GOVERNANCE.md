# Gobierno del dato en RootCause Blockchain Intelligence

Una herramienta de investigación sobre blockchain acumula, por definición, datos
que describen la actividad de terceros. Este documento fija qué entra, qué no
entra nunca, cuánto se conserva, qué se puede modificar y qué conclusiones el
sistema tiene prohibido sacar. No es una declaración de intenciones: cada
apartado remite al punto del código que lo hace cumplir.

Fuente de verdad: `src/domain/secret-guard.js` (material prohibido),
`src/services/intelligence-service.js` (cotas, reorganizaciones, evidencia y
auditoría), `src/domain/intelligence/model.js` (procedencia y niveles
epistémicos), `src/services/intelligence-datasets.js` y
`src/services/intelligence-connectors.js` (adquisición).

## Qué datos entra el sistema

Dos categorías, y ninguna más.

1. **Datos públicos on-chain.** Bloques y transacciones: alturas, hashes,
   marcas de tiempo, entradas, salidas, transferencias, importes, direcciones
   públicas, comisiones, dirección de contrato y nombre de método. Todo ello es
   información que cualquiera puede leer de la cadena.
2. **Registros locales del operador.** Contratos y tokens etiquetados, drainers
   conocidos, puentes e incidentes (`exploits`) que el propio operador registra
   en su instalación, con su etiqueta, su motivo y su fecha.

Las vías de entrada son tres, todas de solo lectura:

- **Datasets locales** (`examples/datasets/`), cargados por identificador. El
  identificador está restringido por el patrón `^[0-9a-z][0-9a-z-]{2,60}$` y,
  como defensa en profundidad, se comprueba además que la ruta resuelta siga
  dentro del directorio de datasets. Es lo único que separa ese cargador de una
  lectura arbitraria del sistema de archivos.
- **Conectores de solo lectura.** La interfaz de conector no tiene operaciones
  de firma ni de difusión: `readOnly: true`, `canSign: false`,
  `canBroadcast: false` no son etiquetas, son la descripción de una interfaz que
  carece de esas funciones. El conector EVM reutiliza el cliente JSON-RPC con su
  allowlist de métodos de lectura; el conector de Bitcoin tiene su propia
  allowlist (`getblockchaininfo`, `getblockhash`, `getblock`,
  `getrawtransaction`, `getblockcount`) y **rechaza credenciales embebidas en la
  URL**, así como cualquier esquema distinto de HTTP o HTTPS.
- **Ingesta directa por API** (`POST /api/v1/intelligence/ingest`), con un
  máximo de 500 bloques y 5000 transacciones por petición.

El dataset local es la fuente por defecto y no toca la red: permite ejecutar el
pipeline completo, las pruebas y la demo sin depender de un tercero y **sin
revelar a nadie qué se está investigando**.

## Qué NUNCA acepta

`assertNoSecretMaterial` se ejecuta al principio de toda entrada de datos:
ingesta, alta de registros locales, registro de exploits, actualización de
alertas, apertura y actualización de casos, adjunto de evidencia y análisis
previo de una transacción. Recorre el objeto **a cualquier profundidad**, dentro
de arrays y objetos anidados, y rechaza con HTTP 422
(`SECRET_MATERIAL_REJECTED`).

**Por nombre de campo** — la comparación ignora mayúsculas, guiones y guiones
bajos, de modo que `private_key`, `PrivateKey` y `privatekey` caen igual:

`privateKey`, `signingKey`, `secret`, `password`, `mnemonic`, `seed`,
`seedPhrase`, `recoveryPhrase`, `recoveryWords`, `keystore`, `walletBackup`,
`xprv`, `tprv`, `wif`, `rawSignedTransaction`, `rpcPassword`, `authorization`,
`authToken`, `accessToken`, `refreshToken`, `clientSecret`, `apiKey`.

**Por contenido de la cadena**, aunque el campo se llame de otro modo:

- claves extendidas `xprv`/`tprv`;
- claves privadas en formato WIF;
- bloques PEM `-----BEGIN … PRIVATE KEY-----`;
- URL con credenciales embebidas (`https://usuario:clave@host`).

Las mismas reglas se aplican al escribir en la auditoría: `redactForAudit`
sustituye por `[REDACTED]` los campos prohibidos y las cadenas con aspecto de
secreto, y trunca a 512 caracteres. Un secreto que llegara por error no queda
copiado en el registro inmutable.

Y por el lado de la salida: el producto **no construye, no firma y no transmite
transacciones**. El endpoint de análisis previo de una transacción
(`POST /api/v1/risk/transactions`) devuelve `decision: "advisory-only"` y una
lista de advertencias; no autoriza ni bloquea nada.

## Procedencia obligatoria

Ningún hecho entra sin `DataSource`. Cada bloque y cada transacción almacena el
`kind` de la fuente, su `id`, su `endpoint` y el `retrievedAt` en que se
obtuvo. La fiabilidad **no la declara quien envía el dato**: se deriva del
`kind` según la tabla `SOURCE_RELIABILITY` documentada en
[`DATA-MODEL.md`](DATA-MODEL.md), y un `kind` desconocido se degrada a
`unknown` (0,3).

Esa fiabilidad se propaga hasta el final de la cadena: un indicador construido
sobre varias transacciones hereda **la menor** fiabilidad de todas ellas, esa
fiabilidad puede rebajar su confianza, y en el puntaje descuenta hasta 15 puntos
y limita la confianza del análisis. Una señal fuerte sobre un dato dudoso no es
una señal fuerte.

Los conectores, además, exponen métricas propias (`requests`, `failures`,
`retries`, `lastError`, `lastLatencyMs`, `lastSuccessAt`) para que el operador
**vea** si su fuente está sana en vez de suponerlo, y un limitador de peticiones
por minuto que impide martillear el origen.

## Retención y cotas

La aplicación es de escritorio y guarda su estado cifrado en un solo archivo.
Sin cotas, una ingesta grande convertiría el arranque en un problema de memoria.
Los límites viven en `LIMITS`, dentro de `src/services/intelligence-service.js`:

| Colección | Cota | Qué se descarta al superarla |
|---|---|---|
| `transactions` | 20 000 | Se ordena por `timestamp` y se conservan las más recientes |
| `blocks` | 5 000 | Se ordena por altura y se conservan los de mayor altura |
| `indicators` | 5 000 | Se conservan los primeros del conjunto ordenado del análisis |
| `alerts` | 2 000 | Se conservan las últimas |
| `evidence` | 5 000 | Se conservan las últimas |
| `cases` | 500 | Se conservan los últimos |

Además, el historial de ejecuciones de ingesta (`ingestion.runs`) se limita a
las **100** últimas.

> **Consecuencia que hay que asumir:** el recorte es silencioso y no reversible
> dentro del producto. Si una investigación necesita conservar un hecho más allá
> de la ventana de retención, ese hecho debe **adjuntarse como evidencia a un
> caso**, que es la única estructura pensada para durar. Adjuntarla no la
> inmuniza frente a la cota de 5000, pero la separa del flujo de ingesta, que es
> el que rota rápido.

Nada de esto tiene expiración por tiempo: no hay borrado automático por
antigüedad, solo por cantidad.

## Reorganizaciones de cadena

Cuando llega un bloque a una altura ya ocupada por otro bloque **no huérfano**
con hash distinto, el pipeline lo trata como reorganización:

1. **No se borra nada.** El bloque anterior recibe `orphaned: true`,
   `orphanedAt` y `replacedBy` con el hash del nuevo.
2. Todas las transacciones cuyo `blockHash` coincida con el bloque desplazado
   quedan marcadas con `orphaned: true` y `orphanedAt`.
3. Se registra el hecho en `ingestion.reorgs` con identificador, red, altura,
   hash anterior, hash nuevo, instante de detección y número de transacciones
   huérfanas.
4. El bloque nuevo entra con normalidad.

**Las transacciones huérfanas se conservan como evidencia pero quedan excluidas
del análisis.** Todo lo que consume datos —el motor de indicadores, el grafo, el
puntaje, el resumen— parte de `activeTransactions`, que filtra las huérfanas.
Analizarlas describiría una historia que la cadena ya descartó; borrarlas
destruiría la prueba de que esa historia existió.

El resultado de una evaluación declara siempre cuántas quedaron fuera:
`dataScope.orphanedExcluded` en cada evaluación de riesgo y
`orphanedTransactions` en el resumen.

## Inmutabilidad de la evidencia

- La evidencia se **congela al crearse**: `makeEvidence` calcula el SHA-256 de
  su `payload` serializado y lo guarda en `contentHash`, junto con `algorithm`,
  `collectedBy`, `collectedAt` e `immutable: true`.
- Su identificador deriva del propio contenido
  (`stableId("evidence", kind, contentHash)`), de modo que adjuntar dos veces lo
  mismo no crea dos piezas.
- **No existe ninguna operación de edición.** Ni el servicio ni la API tienen un
  método para modificar o eliminar una pieza de evidencia: solo
  `POST /api/v1/intelligence/cases/:id/evidence` para añadir y
  `GET /api/v1/intelligence/evidence/verify` para comprobar.
- La verificación recalcula el hash de todo el conjunto y devuelve `total`,
  `valid`, la lista de piezas `tampered` y `checkedAt`. El informe de caso
  incluye además el resultado de integridad de cada pieza que cita.

Que no haya operación de edición es la propiedad; el hash es solo la forma de
detectar una manipulación hecha por fuera, sobre el archivo de estado.

## Auditoría encadenada

Todo lo que muta estado pasa por la cola de escritura del servicio y deja una
entrada en la cadena de auditoría del producto, que enlaza cada registro con el
hash SHA-256 del anterior. Las acciones del dominio de inteligencia son
`intelligence_ingest_completed`, `intelligence_registry_updated`,
`intelligence_exploit_registered`, `intelligence_analysis_completed`,
`intelligence_alert_updated`, `intelligence_case_opened`,
`intelligence_case_updated` e `intelligence_evidence_attached`.

Cada entrada guarda actor, instante, tipo y ficha de la entidad afectada, y
metadatos redactados. `verifyAuditChain` recorre la cadena entera y señala la
primera entrada rota, distinguiendo si falla el enlace (`previous_hash_mismatch`)
o el contenido (`entry_hash_mismatch`). Se consulta con `GET /api/audit`.

El actor no se inventa: llega en la cabecera `x-rootcause-actor` y, si no encaja
con el patrón permitido, se registra como `local-user`. La ingesta programática
se registra por defecto como `collector` y las acciones de analista como
`local-analyst`.

## No se atribuye identidad a una dirección

Es la regla más importante y la más fácil de romper por descuido.

- El sistema **no produce identidades verificadas**. `verified-identity` existe
  como nivel declarado y no hay una sola línea de código que lo asigne.
- El motor no consulta ninguna lista remota de reputación. La marca de una
  dirección procede siempre del registro **local** del operador, y así lo dice
  la evidencia del propio indicador: *«La marca proviene del registro LOCAL del
  operador, no de un servicio remoto de reputación»*. La decisión también evita
  filtrar al proveedor de la lista qué se está investigando.
- Las agrupaciones son hipótesis. Un `WalletCluster` nace con
  `epistemicLevel: "hypothesis"` y un aviso literal: *«Agrupación heurística, no
  identidad. No atribuye la titularidad a ninguna persona ni entidad»*. Las
  comunidades del grafo son componentes conexos y llevan su propia advertencia:
  no implican titularidad común.
- Toda evaluación de riesgo incluye, entre sus limitaciones fijas, que ninguna
  dirección se relaciona con una persona o entidad, y `requiresHumanReview` vale
  siempre `true`.
- El informe de caso encabeza con el aviso epistémico y declara que **no
  contiene identidades verificadas ni conclusiones sobre personas**.
- Los textos siguen la misma disciplina que las reglas preventivas del producto:
  un indicador dice «marcado localmente», nunca «malicioso».

## Calidad del dato y registro de falsos positivos

El sistema no suprime indicadores para parecer preciso. Cuando una alerta se
resuelve como falso positivo, esa resolución **se guarda como dato**.

Al pasar una alerta a `false-positive` mediante
`PATCH /api/v1/intelligence/alerts/:id`, el servicio escribe:

- `falsePositiveReason`, con la nota que envió el analista, o el texto
  `"Sin motivo declarado."` si no envió ninguna;
- `falsePositiveAt`, con el instante de la decisión;
- una entrada en el `history` de la alerta con el actor, el estado anterior y el
  nuevo;
- la entrada correspondiente en la cadena de auditoría.

Qué permite medir ese campo, con los datos que el propio producto ya guarda:

| Pregunta | Cómo se obtiene |
|---|---|
| ¿Qué indicador produce más ruido? | Agrupar las alertas `false-positive` por su campo `indicator` |
| ¿Qué umbral está mal calibrado? | Cruzar esas alertas con el `thresholdsApplied` del indicador que las originó |
| ¿Con qué frecuencia falla el motor? | `summary.alerts.falsePositives` frente a `summary.alerts.total` |
| ¿Se repite el mismo motivo? | Leer los `falsePositiveReason` acumulados de un mismo `indicator` |
| ¿Quién y cuándo lo decidió? | `history` de la alerta y la entrada de auditoría |

El escenario `examples/datasets/10-falso-positivo.json` existe justamente para
fijar esta postura: una dirección de depósito etiquetada por el operador recibe
fondos de doce clientes, el indicador de fan-in **se activa correctamente** y el
hallazgo es aun así un falso positivo. El indicador no se suprime: el puntaje lo
atenúa con el factor `labelled-counterparty` (−12 puntos) y lo explica.
Suprimirlo escondería el patrón; atenuarlo lo hace discutible.

Otras señales de calidad que el producto ya expone sin trabajo adicional:

- `summary.orphanedTransactions` y `summary.reorgs`: cuánta de la historia
  ingerida quedó descartada por la cadena.
- `sourceReliability` de cada evaluación: sobre qué calidad de fuente se
  sostiene el resultado.
- `truncated` y `truncationReasons` en los recorridos del grafo: un resultado
  acotado se declara incompleto en vez de fingir ser exhaustivo.
- Métricas de cada conector: si la fuente falla, se ve.
- El dataset `examples/datasets/01-actividad-normal.json` es la línea base de
  regresión: **ningún** indicador debe activarse sobre él.

## Documentos relacionados

- Entidades, campos y niveles epistémicos: [`DATA-MODEL.md`](DATA-MODEL.md).
- Flujo de trabajo del analista: [`INVESTIGATION-GUIDE.md`](INVESTIGATION-GUIDE.md).
- Postura de privacidad de la instalación:
  [`POLITICA_DE_PRIVACIDAD_LOCAL.md`](POLITICA_DE_PRIVACIDAD_LOCAL.md).
- Fronteras de lo que el producto no cubre:
  [`WALLET-SECURITY-BOUNDARIES.md`](WALLET-SECURITY-BOUNDARIES.md).
