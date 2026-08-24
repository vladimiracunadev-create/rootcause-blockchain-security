# Forense blockchain: grafo, seguimiento de fondos y sus límites

Cómo este producto representa el movimiento de valor, qué preguntas puede
responder sobre él y —más importante— cuáles no.

Fuente de verdad: `src/domain/intelligence/graph.js`.

## El grafo

- **Nodo:** una dirección pública, en su forma canónica (`red:dirección`).
- **Arista:** una transferencia de valor observada, con su transacción, bloque,
  importe, activo e instante.

Las dos familias de red se normalizan al mismo grafo:

| Familia | Cómo se derivan las aristas |
|---|---|
| **Cuentas** (Ethereum) | Cada transferencia tiene emisor y receptor explícitos |
| **UTXO** (Bitcoin) | Cada salida recibe valor de la primera entrada con dirección |

La derivación en UTXO es una **inferencia estructural**, no un hecho: una
transacción con varias entradas no dice cuál financió cada salida. El modelo lo
marca con `kind: "utxo-derived"` para que un análisis pueda descartar esas
aristas si necesita solo hechos.

## Límites de seguridad, no opcionales

Un grafo de transacciones invita a consultas ilimitadas: «sígueme este dinero»
puede recorrer media cadena y agotar el proceso. Todas las operaciones aceptan
cotas y **ninguna puede superar los techos duros**:

| Cota | Techo | Por defecto |
|---|---|---|
| Profundidad | 6 | 3 |
| Nodos | 2 000 | 250 |
| Aristas | 8 000 | 1 000 |
| Caminos | 25 | 10 |
| Ciclos | 50 | 20 |

Pedir `depth=100000` no produce un recorrido profundo: produce un recorrido de
profundidad 6. El gate `pnpm check:security` lo comprueba lanzando esa consulta
contra la aplicación real.

Cuando una cota se alcanza, el resultado **declara que está truncado** y por
qué (`max-depth`, `max-nodes`, `max-edges`). Un resultado truncado que se
presentara como completo sería peor que no tener la función.

## Qué preguntas responde

### Seguimiento hacia adelante y hacia atrás

`traverse()` recorre desde una dirección en tres modos: `forward` (a dónde
fueron los fondos), `backward` (de dónde vinieron) y `both`. Devuelve cada nodo
con su número de saltos desde el origen, lo que permite dibujar el recorrido
por capas.

### Caminos entre dos direcciones

`findPaths()` busca caminos **simples** (sin repetir nodo) entre un origen y un
destino. Es la operación que responde a «¿hay alguna ruta observable entre estas
dos direcciones?». La respuesta negativa no significa que no exista: significa
que no existe dentro de la profundidad consultada y de los datos ingeridos.

### Ciclos

`detectCycles()` encuentra fondos que vuelven a una dirección por la que ya
pasaron. Es un patrón interesante, y también algo que ocurre continuamente en
operativa normal (rebalanceo, pruebas, devoluciones).

### Distancia a una dirección marcada

`distanceToFlagged()` mide en cuántos saltos se alcanza la dirección marcada
más cercana del registro **local** del operador. Alimenta el factor de
proximidad del [modelo de riesgo](RISK-MODEL.md), con una advertencia que viaja
siempre con el resultado: **la proximidad no implica relación ni
participación.**

### Comunidades

`findCommunities()` calcula componentes conexos ignorando la dirección de las
aristas. Es la agrupación más conservadora posible: dice «estas direcciones
están conectadas por transferencias observadas», no «estas direcciones son del
mismo dueño». El resultado se marca como `inference` y lleva su advertencia.

### Concentración de flujo

`fanSummary()` resume orígenes y destinos únicos alrededor de una dirección, que
es la base de los indicadores de fan-in y fan-out.

## Filtros

Todas las operaciones aceptan filtrar por activo, red, importe mínimo y rango de
fechas. Filtrar es también una decisión analítica: un recorrido filtrado por
importe mínimo puede perder exactamente el salto que interesa.

## Determinismo

Las listas de aristas se ordenan por instante y luego por un identificador
estable; los recorridos expanden en orden alfabético. La consecuencia es que
**el mismo grafo produce siempre el mismo resultado**, lo que permite que una
captura de un recorrido sea evidencia reproducible y no una foto irrepetible.

## Agrupación de direcciones: siempre hipótesis

`makeWalletCluster()` produce agrupaciones con la heurística usada y su nivel de
confianza, marcadas como `hypothesis` y con una advertencia explícita de que no
atribuyen titularidad a ninguna persona ni entidad.

La heurística clásica de UTXO —«las entradas de una misma transacción están
controladas por la misma entidad»— es útil y es **falsable**: CoinJoin,
PayJoin y cualquier transacción colaborativa la rompen por diseño. El sistema
no permite promover una agrupación a identidad verificada; esa categoría existe
en el modelo precisamente para dejar claro que este producto no la produce.

## Lo que este producto no puede hacer

### No sigue fondos entre redes

`INT-BRIDGE-001` detecta el uso encadenado de puentes en la red observada. La
correlación de los fondos **al otro lado del puente** no está implementada:
exige emparejar dos redes con criterios de importe y tiempo, y ese
emparejamiento es una inferencia con una tasa de error que no se puede declarar
honestamente sin datos reales. Está en el roadmap; hoy es trabajo manual.

### No desanonimiza

No hay atribución de identidad, ni cruce con datos personales, ni consulta a
proveedores de inteligencia. Una dirección es una dirección.

### No ve lo que no se ingirió

El grafo se construye sobre las transacciones que entraron al pipeline. Un
recorrido que «no encuentra nada» puede significar que no hay nada o que faltan
datos. El resultado siempre publica `dataScope` con cuántas transacciones se
analizaron y cuándo fue la última ingesta.

### No ve el mempool

Solo transacciones confirmadas e ingeridas. Nada pendiente.

### No observa reorganizaciones que no se le cuenten

El pipeline detecta una reorganización cuando llega un bloque distinto a una
altura ya conocida, marca el anterior y sus transacciones como huérfanos y los
excluye del análisis sin borrarlos. Si nadie vuelve a ingerir esa altura, la
reorganización pasa inadvertida.

## Adquisición de datos

| Conector | Estado | Notas |
|---|---|---|
| Dataset local | **Implementado y por defecto** | No toca la red; es la fuente de la demo y de las pruebas |
| EVM JSON-RPC | **Implementado** | Reutiliza la allowlist de solo lectura existente; localhost por defecto |
| Bitcoin JSON-RPC | **Implementado, con limitación** | Allowlist propia de cinco métodos de lectura |

Todos los conectores son de solo lectura por construcción: la interfaz no tiene
operaciones de firma ni de envío. Todos aplican límite de solicitudes,
reintentos con espera creciente para fallos transitorios (**nunca** para un
método rechazado por la allowlist) y publican métricas para que la salud de la
fuente sea observable en vez de suponerse.

> **Limitación declarada del conector Bitcoin:** no acepta credenciales.
> Bitcoin Core normalmente exige autenticación RPC, y este producto rechaza
> almacenar credenciales por diseño. El camino soportado es un endpoint local
> de solo lectura sin autenticación, o la importación de datasets. Consultado el
> 2026-08-24.

## Privacidad de la investigación

Consultar a un tercero **revela qué estás investigando**. Ésa es la razón por la
que este producto no consulta listas remotas de reputación ni servicios de
inteligencia: la fuga no sería de los datos analizados, sino del hecho mismo de
estar analizándolos.

Si configuras un proveedor RPC remoto, ese proveedor ve qué direcciones y
bloques consultas. Para una investigación sensible, la única opción defendible
es un nodo propio o un dataset importado.

## Documentos relacionados

- [`ONCHAIN-ANALYTICS.md`](ONCHAIN-ANALYTICS.md) — los indicadores que se
  calculan sobre estos hechos.
- [`RISK-MODEL.md`](RISK-MODEL.md) — cómo la proximidad en el grafo entra en el
  puntaje.
- [`INVESTIGATION-GUIDE.md`](INVESTIGATION-GUIDE.md) — el flujo de trabajo.
- [`DATA-MODEL.md`](DATA-MODEL.md) — las entidades normalizadas.
