# Guía de investigación

Recorrido práctico de una investigación completa con las rutas y los comandos
que **existen hoy** en el producto: ingerir datos, analizarlos, revisar las
alertas, entender un puntaje, recorrer el grafo, abrir un caso, adjuntar
evidencia, registrar decisiones, generar el informe y cerrar —incluido el cierre
por falso positivo, que es un resultado legítimo y no un fracaso.

Todos los ejemplos de esta guía se ejecutaron contra el producto en modo demo y
devolvieron lo que aquí se muestra. Las direcciones son las de los datasets
sintéticos: son ficticias y no corresponden a nadie.

## Antes de empezar

Arranca la aplicación:

~~~text
pnpm start
~~~

Base local: `http://127.0.0.1:8790`. En esta guía se abrevia como `$B`.

~~~bash
B=http://127.0.0.1:8790
~~~

**Toda mutación exige la cabecera `x-rootcause-request: 1`.** Sin ella la
petición se rechaza con 403 (`MUTATION_HEADER_REQUIRED`) antes de llegar al
router. El actor es opcional y se declara con `x-rootcause-actor`; si falta o no
encaja con el patrón permitido, queda registrado como `local-user`. Todas las
peticiones con cuerpo exigen `content-type: application/json`.

Para abreviar, en los ejemplos:

~~~bash
H=(-H 'content-type: application/json'
   -H 'x-rootcause-request: 1'
   -H 'x-rootcause-actor: analista')
~~~

Por defecto la aplicación arranca en modo demo, con seis escenarios ya cargados
y analizados. Para trabajo real, `DEMO_MODE=false` y una clave de datos
(`pnpm generate:data-key`); el estado se guarda cifrado en un solo archivo.

## 1. Ingerir datos

### Opción A: un dataset incluido

Lista lo disponible:

~~~bash
curl -s $B/api/v1/intelligence/datasets
~~~

Devuelve, para cada escenario, su `id`, título, descripción, red, número de
transacciones, `evaluateAt` y el bloque `expected` con los indicadores que debe
producir. Son diez escenarios reproducibles, de la línea base sin señales
(`01-actividad-normal`) al falso positivo declarado (`10-falso-positivo`).

Ingiere uno:

~~~bash
curl -s -X POST $B/api/v1/intelligence/ingest/dataset "${H[@]}" \
  -d '{"datasetId":"05-transferencias-rapidas"}'
~~~

Primero entran los registros locales que el escenario declara (contratos,
drainers, puentes y exploits) y después sus transacciones, para que el análisis
posterior disponga del contexto. La respuesta trae el resumen de la ejecución:

~~~json
{"stats":{"blocksAccepted":0,"blocksDuplicated":0,
          "transactionsAccepted":3,"transactionsDuplicated":0,
          "reorgs":0,"orphanedTransactions":0}}
~~~

Repetir el mismo comando devuelve `transactionsAccepted: 0` y
`transactionsDuplicated: 3`: la ingesta es idempotente por `red:txid`.

### Opción B: tus propios datos

~~~bash
curl -s -X POST $B/api/v1/intelligence/ingest "${H[@]}" -d '{
  "source": {"kind": "own-node", "id": "nodo-interno", "endpoint": "getblock"},
  "transactions": [{
    "network": "ethereum",
    "txid": "0xaa10000000000000000000000000000000000000000000000000000000000000",
    "blockHeight": 21000010,
    "timestamp": "2026-08-01T09:00:00.000Z",
    "transfers": [{
      "from": "0xb7b7000000000000000000000000000000000000",
      "to":   "0xdead000000000000000000000000000000000000",
      "amountRaw": "500000000000000000",
      "asset": "ETH", "decimals": 18, "kind": "transfer"
    }]
  }]
}'
~~~

Recuerda: **los importes son enteros en unidades mínimas, como cadena**. Nada de
`0.5`. El `kind` de la fuente decide su fiabilidad, y un `kind` que no exista en
la tabla se degrada a `unknown` (0,3). Máximo por petición: 500 bloques y 5000
transacciones.

### Opción C: un conector

~~~bash
curl -s $B/api/v1/intelligence/connectors
curl -s -X POST $B/api/v1/intelligence/ingest/connector "${H[@]}" \
  -d '{"connectorId":"evm-rpc","options":{"blockNumber":21000010}}'
~~~

Los conectores son de solo lectura y lo declaran (`canSign: false`,
`canBroadcast: false`), además de exponer sus métricas de salud.

### Marcar contrapartes en tu registro local

Si sabes algo del terreno, regístralo antes de analizar: cambia el resultado.

~~~bash
curl -s -X POST $B/api/v1/intelligence/registry/contracts "${H[@]}" -d '{
  "network": "ethereum",
  "address": "0xf1f1000000000000000000000000000000000000",
  "label": "Deposito de servicio X",
  "category": "exchange-deposit",
  "flagged": false
}'
~~~

Las rutas disponibles son `registry/contracts`, `registry/drainers` (donde
`flagged` se fuerza a `true`) y `registry/bridges`. Los incidentes van aparte,
con fecha:

~~~bash
curl -s -X POST $B/api/v1/intelligence/exploits "${H[@]}" -d '{
  "network": "ethereum",
  "address": "0xdead000000000000000000000000000000000000",
  "label": "Incidente interno 2026-08",
  "occurredAt": "2026-08-01T08:00:00.000Z",
  "description": "Registrado por el operador"
}'
~~~

Una etiqueta sin `flagged` **atenúa** el puntaje (factor
`labelled-counterparty`, −12); una marca lo **aumenta** por proximidad. En ambos
casos es tu marca, no la de un tercero.

## 2. Ejecutar el análisis

~~~bash
curl -s -X POST $B/api/v1/intelligence/analyze "${H[@]}" -d '{}'
~~~

~~~json
{"analyzedAt":"2026-08-24T21:15:43.684Z","indicators":8,"alertsCreated":1}
~~~

El motor recorre **todas** las transacciones no huérfanas, no solo las recién
ingeridas, y reevalúa el conjunto entero. Es determinista: los mismos datos y
los mismos umbrales producen exactamente los mismos indicadores, en el mismo
orden. Un indicador ya conocido no crea una alerta nueva: actualiza su
`lastSeenAt`.

Para ver dónde estás en cualquier momento:

~~~bash
curl -s $B/api/v1/intelligence/summary
~~~

Trae redes presentes, transacciones activas, huérfanas, bloques, reorganizaciones,
indicadores, alertas por severidad, falsos positivos, casos, evidencia, tamaño
del grafo, registros locales, última ingesta, versión del modelo y estado de los
conectores.

## 3. Revisar las alertas

~~~bash
curl -s "$B/api/v1/intelligence/alerts?status=new"
curl -s "$B/api/v1/intelligence/alerts?subject=ethereum:0xc8c8000000000000000000000000000000000000"
~~~

Cada alerta trae la explicación con los números concretos que la activaron:

~~~text
INT-FLOW-003 · high · confidence medium
subject: ethereum:0xe1e1000000000000000000000000000000000000
"El valor salido de 0xe1e10000…000000 atravesó 3 direcciones encadenadas
 conservando al menos el 50 % en cada salto, con menos de 30 minutos entre
 saltos."
~~~

Toma la alerta y márcala como tuya antes de trabajarla:

~~~bash
curl -s -X PATCH $B/api/v1/intelligence/alerts/alert-5b5fcadb9a08ab2d2cc4 "${H[@]}" \
  -d '{"status":"in-review","assignedTo":"analista","note":"Reconstruyendo la cadena de saltos"}'
~~~

Estados válidos: `new`, `in-review`, `confirmed`, `false-positive`, `mitigated`,
`closed`. Cada cambio queda en el `history` de la alerta y en la auditoría.

Si necesitas el contexto de la regla —qué mide, qué falsos positivos tiene, qué
recomienda comprobar— consulta el catálogo:

~~~bash
curl -s $B/api/v1/intelligence/indicators
~~~

## 4. Consultar el riesgo de una dirección

~~~bash
curl -s $B/api/v1/risk/addresses/ethereum/0xc8c8000000000000000000000000000000000000
~~~

Existe también `/api/v1/risk/contracts/{red}/{dirección}`, que ejecuta la misma
evaluación.

### Cómo se lee la respuesta

Sobre el escenario `08-drainer-simulado`, la dirección de la víctima devuelve:

~~~json
{
  "score": 77, "band": "critical", "confidence": "medium",
  "factorsIncreasing": [
    {"id": "INT-EXPO-004", "points": 34},
    {"id": "INT-EXPO-003", "points": 26},
    {"id": "graph-proximity", "points": 18}
  ],
  "factorsDecreasing": [{"id": "source-reliability", "points": -1}],
  "proximity": {"distance": 1, "via": "ethereum:0xdada…", "truncated": false},
  "dataScope": {"transactionsAnalyzed": 34, "orphanedExcluded": 0},
  "requiresHumanReview": true
}
~~~

Lee **de abajo arriba**:

1. **`dataScope`** — sobre cuántas transacciones se calculó y cuántas quedaron
   fuera por huérfanas. Un puntaje sobre 34 transacciones dice poco del mundo.
2. **`factorsIncreasing`** — de dónde sale cada punto. Cada factor lleva su
   `weight` desglosado: peso base de la severidad, bonus por repetición, factor
   de antigüedad (la evidencia decae con vida media de 90 días, hasta un 60 %) y
   multiplicador de confianza.
3. **`factorsDecreasing`** — qué lo baja: fiabilidad limitada de la fuente,
   contraparte etiquetada localmente, historial largo sin cambios, aprobación
   revocada, o un único indicador de baja confianza.
4. **`proximity`** — a cuántos saltos está la dirección marcada más cercana, y
   por cuál. Con su advertencia: la proximidad no implica relación.
5. **`confidence`** — cuánto respalda la evidencia al resultado. Es
   **independiente del puntaje**: 77 puntos con confianza media significa muchas
   señales y poco respaldo, no una certeza.
6. **`limitations`** — la lista siempre presente de lo que este número no dice.
7. **`indicators`** — cada indicador del sujeto con su evidencia, sus falsos
   positivos posibles y su acción recomendada. Empieza por ahí antes de escalar.

Bandas: `low` 0–24, `moderate` 25–49, `high` 50–74, `critical` 75–100. El
puntaje mide **exposición a señales investigables sobre los datos ingeridos**,
no culpabilidad, y `requiresHumanReview` vale siempre `true`.

### Antes de mover fondos hacia un destino

~~~bash
curl -s -X POST $B/api/v1/risk/transactions "${H[@]}" -d '{
  "network": "ethereum",
  "from": "0xb7b7000000000000000000000000000000000000",
  "to":   "0xdead000000000000000000000000000000000000"
}'
~~~

Devuelve la evaluación del destino, una lista de advertencias y
`decision: "advisory-only"`. **El producto no construye, firma ni transmite
transacciones**, y este endpoint no autoriza ni bloquea nada.

## 5. Recorrer el grafo

Hacia adelante (a dónde fue el dinero):

~~~bash
curl -s "$B/api/v1/intelligence/graph/ethereum/0xe1e1000000000000000000000000000000000000?direction=forward&depth=3"
~~~

Hacia atrás (de dónde vino):

~~~bash
curl -s "$B/api/v1/intelligence/graph/ethereum/0xf1f1000000000000000000000000000000000000?direction=backward&depth=2"
~~~

`direction` acepta `forward`, `backward` y `both`. Parámetros opcionales:
`depth`, `maxNodes`, `maxEdges`, y los filtros `asset`, `minAmountRaw`
(entero, en unidades mínimas), `since` y `until`.

La respuesta trae los nodos con su distancia en saltos (`hops`), las aristas,
un `fan` con la concentración de entrada y salida alrededor del sujeto, la lista
`flaggedNodes` de los nodos alcanzados que están marcados en tu registro, y —lo
importante— `truncated` con sus `truncationReasons` (`max-depth`, `max-nodes`,
`max-edges`). **Un recorrido acotado se declara incompleto en vez de fingir ser
exhaustivo.** Si ves `truncated: true`, sube el límite o acota con filtros, pero
no leas el resultado como el mapa completo.

### Caminos entre dos direcciones

~~~bash
curl -s "$B/api/v1/intelligence/paths?network=ethereum\
&from=0xe1e1000000000000000000000000000000000000\
&to=0xe4e4000000000000000000000000000000000000&depth=4"
~~~

Devuelve caminos **simples** (sin repetir nodo) en sentido de las
transferencias, cada uno con sus nodos, sus aristas y su número de saltos, más
`truncated` y los límites aplicados. Parámetros: `depth`, `maxPaths` y los
mismos filtros del grafo.

### Dos vistas de conjunto

~~~bash
curl -s "$B/api/v1/intelligence/cycles?depth=5&maxCycles=20"
curl -s "$B/api/v1/intelligence/communities?limit=25"
~~~

Los ciclos son fondos que vuelven a una dirección por la que ya pasaron. Las
comunidades son **componentes conexos** por transferencias observadas, con nivel
`inference` y su advertencia: conectadas no significa del mismo dueño.

## 6. Abrir un caso

~~~bash
curl -s -X POST $B/api/v1/intelligence/cases "${H[@]}" -d '{
  "title": "Salida de fondos 2026-08",
  "summary": "Revision de una cadena de saltos rapidos",
  "priority": "high",
  "alertIds": ["alert-5b5fcadb9a08ab2d2cc4"]
}'
~~~

Devuelve el caso con su identificador (`case-359cd13516e8b4180103`), su
`timeline` iniciada y las alertas incluidas ya enlazadas por su `caseId`.
Prioridades: `low`, `medium`, `high`, `critical`. Estados: `open`, `in-review`,
`closed`.

## 7. Adjuntar evidencia

~~~bash
curl -s -X POST $B/api/v1/intelligence/cases/case-359cd13516e8b4180103/evidence "${H[@]}" -d '{
  "kind": "graph-snapshot",
  "description": "Camino observado entre origen y destino",
  "payload": {"nodes": ["ethereum:0xe1e1000000000000000000000000000000000000"]}
}'
~~~

La pieza se congela al crearse, con su SHA-256:

~~~json
{"id":"evidence-0b719c173c6dcb9bc6f2","kind":"graph-snapshot",
 "contentHash":"de8797e8480e2af93d7782fb218b2350b30e0e3f956cb04aa1dcc6999e095885",
 "algorithm":"sha256","immutable":true}
~~~

**No hay operación de edición ni de borrado.** Si te equivocaste, adjunta una
pieza nueva y explica el error en una nota del caso; la anterior sigue ahí, que
es exactamente el punto.

Comprueba la integridad del conjunto cuando quieras:

~~~bash
curl -s $B/api/v1/intelligence/evidence/verify
~~~

~~~json
{"total":1,"valid":true,"tampered":[],"checkedAt":"2026-08-24T21:16:06.130Z"}
~~~

## 8. Registrar notas y decisiones

~~~bash
curl -s -X PATCH $B/api/v1/intelligence/cases/case-359cd13516e8b4180103 "${H[@]}" -d '{
  "status": "in-review",
  "note": "El primer salto ocurre 4 minutos despues del anterior",
  "decision": "Escalar a revision con la segunda fuente"
}'
~~~

Las notas (hasta 1000 caracteres) y las decisiones (hasta 400) se **acumulan**:
cada una entra con su instante y su actor en `notes[]` o `decisions[]`, y deja
un evento en el `timeline`. Nada se sobrescribe. Puedes enlazar más alertas al
caso en la misma llamada, con `alertIds`.

La disciplina que conviene mantener: la **nota** describe lo observado, la
**decisión** describe lo que se hizo con ello y por qué. Separarlas es lo que
permite, meses después, discutir el criterio sin rediscutir los hechos.

## 9. Generar el informe

~~~bash
curl -s $B/api/v1/intelligence/cases/case-359cd13516e8b4180103/report
~~~

El informe reúne el caso completo con su cronología, las alertas enlazadas, los
indicadores que las originaron, una evaluación de riesgo recalculada para cada
sujeto implicado, toda la evidencia con su verificación de integridad, la
versión del modelo, el aviso epistémico y la lista de limitaciones.

El aviso no es decorativo: distingue en el propio documento los **hechos
observados** (transacciones y procedencia), los **indicadores** (patrones
deterministas), las **inferencias** (puntaje y proximidad) y las **hipótesis**
(agrupaciones), y declara que el informe no contiene identidades verificadas ni
conclusiones sobre personas. Si vas a entregarlo a alguien, entrégalo con ese
aviso incluido.

Cuando el informe forme parte del expediente, adjúntalo también como evidencia
del caso: así queda su hash junto a la cadena de auditoría.

## 10. Cerrar

Si la investigación confirma el hallazgo:

~~~bash
curl -s -X PATCH $B/api/v1/intelligence/alerts/alert-5b5fcadb9a08ab2d2cc4 "${H[@]}" \
  -d '{"status":"confirmed","note":"Cadena reconstruida y documentada en el caso"}'

curl -s -X PATCH $B/api/v1/intelligence/cases/case-359cd13516e8b4180103 "${H[@]}" \
  -d '{"status":"closed","decision":"Informe entregado al responsable"}'
~~~

### Cerrar declarando un falso positivo

Cuando el patrón era real pero la explicación es inocua, dilo con el motivo:

~~~bash
curl -s -X PATCH $B/api/v1/intelligence/alerts/alert-5b5fcadb9a08ab2d2cc4 "${H[@]}" \
  -d '{"status":"false-positive","note":"Rebalanceo interno entre wallets del mismo operador"}'
~~~

~~~json
{"status":"false-positive",
 "falsePositiveReason":"Rebalanceo interno entre wallets del mismo operador",
 "falsePositiveAt":"2026-08-24T21:16:06.248Z"}
~~~

**Escribe siempre el motivo.** Sin nota, el campo queda como
`"Sin motivo declarado."` y se pierde lo único que permite después medir qué
indicador produce ruido y qué umbral está mal calibrado. Un falso positivo
documentado mejora el motor; uno cerrado en silencio solo baja un contador.

Si además tienes contexto estable —esa dirección es un depósito conocido,
aquella es tu propia wallet caliente—, regístralo en el registro local. El
indicador seguirá activándose (no se suprime: eso escondería el patrón), pero el
puntaje lo atenuará y lo explicará. El escenario
`examples/datasets/10-falso-positivo.json` reproduce exactamente ese caso.

## Errores de interpretación frecuentes

### Leer el puntaje como un veredicto

No lo es, y el propio resultado lo dice de cuatro maneras distintas: mide
exposición a señales investigables **sobre los datos ingeridos**, la ausencia de
indicadores no demuestra ausencia de riesgo, `requiresHumanReview` vale siempre
`true` y el número nunca se devuelve sin sus factores. Un 77 no significa «77 %
de probabilidad de delito»: significa que se acumularon 77 puntos por factores
concretos que puedes leer, discutir y refutar uno a uno. Y un 12 no absuelve a
nadie: puede ser simplemente una dirección de la que apenas se ingirieron datos.

### Tratar una agrupación como titularidad

Las comunidades del grafo son componentes conexos: dicen que existe un camino de
transferencias observadas entre esas direcciones. Nada más. Cualquier
agrupación heurística nace con nivel `hypothesis` y con la advertencia de que no
atribuye titularidad a ninguna persona ni entidad. Recibir fondos de alguien no
te convierte en ese alguien, y usar el mismo servicio tampoco.

### Tratar la proximidad en el grafo como complicidad

El factor `graph-proximity` suma puntos por estar cerca de una dirección marcada
en **tu** registro: 30 si la propia dirección está marcada, 18 a un salto, 10 a
dos, 5 a tres, 2 a cuatro. Su advertencia va en la respuesta: *una dirección
puede recibir fondos sin conocer su origen*. La cadena no pide permiso al
receptor. Una víctima de un drainer está a un salto del drainer, y eso no la
convierte en cómplice: en el escenario `08-drainer-simulado` la dirección que
puntúa 77 es precisamente la víctima.

### Confundir tu marca local con una reputación externa verificada

El producto **no consulta ninguna lista remota de reputación**, por decisión
deliberada: hacerlo revelaría al proveedor qué estás investigando. Todo lo que
aparece como «marcado» lo marcaste tú o lo trajo un dataset que tú cargaste, y
la evidencia del indicador lo repite: *la marca proviene del registro LOCAL del
operador*. De ahí que la acción recomendada de esos indicadores sea revisar **por
qué** está marcada la contraparte y con qué evidencia, antes que actuar. Una
marca heredada sin revisar, con años encima, es una hipótesis vieja, no un
hecho.

### Dos descuidos más, menores pero caros

- **Olvidar que el resultado está truncado.** Si `truncated` es `true`, el grafo
  que estás mirando no es el grafo: es lo que cupo dentro de los límites.
- **Olvidar reejecutar el análisis.** Ingerir no analiza. Hasta que no llames a
  `analyze`, los indicadores y las alertas siguen describiendo los datos
  anteriores.

## Documentos relacionados

- Entidades, campos y niveles epistémicos: [`DATA-MODEL.md`](DATA-MODEL.md).
- Retención, procedencia y política de no atribución:
  [`DATA-GOVERNANCE.md`](DATA-GOVERNANCE.md).
- Reglas preventivas `BLK-*`, que son un catálogo distinto:
  [`HEURISTICAS.md`](HEURISTICAS.md) y
  [`DETECCION_AMENAZAS.md`](DETECCION_AMENAZAS.md).
- API heredada del producto: [`API.md`](API.md).
