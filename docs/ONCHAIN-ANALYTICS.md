# Analítica on-chain: los quince indicadores investigativos

Este documento es el contrato exacto del motor de inteligencia: qué patrón
busca cada indicador, con qué umbral, qué evidencia conserva, cómo puede
equivocarse y qué debe hacer un analista con él.

Fuente de verdad: `src/domain/intelligence/indicators.js`. Catálogo:
`config/intelligence-indicators.json`. Umbrales:
`config/intelligence-policies.json`. El gate `pnpm check:rules` impide que los
tres se desincronicen, y exige que cada indicador declare al menos dos falsos
positivos posibles y una acción recomendada.

## Un indicador no es un hallazgo, y no es una acusación

La distinción que sostiene todo este dominio:

| Categoría | Qué significa | Quién la produce |
|---|---|---|
| **Hecho observado** | La cadena lo dice y conservamos su procedencia | El pipeline de ingesta |
| **Indicador** | Un patrón determinista apareció sobre esos hechos | El motor de indicadores |
| **Inferencia** | Algo derivado de combinar hechos (puntaje, proximidad, comunidad) | El modelo de riesgo y el grafo |
| **Hipótesis** | Una agrupación o relación no confirmada | Las heurísticas de clustering |
| **Identidad verificada** | Una dirección pertenece a una persona o entidad concreta | **Nunca este sistema** |

Un indicador dice «este patrón está aquí, con esta confianza, y así es como
podría estar equivocándose». No dice quién es nadie, no concluye y no autoriza
ninguna acción automática.

Los controles preventivos `BLK-*` ([`HEURISTICAS.md`](HEURISTICAS.md)) son un
catálogo **distinto**: aquéllos verifican una política declarada; éstos abren
una línea de investigación. Un `BLK-*` te dice que tu control está mal puesto;
un `INT-*` te dice que hay algo que mirar.

## Cómo se evalúa

1. **Determinista.** Las mismas transacciones y los mismos umbrales producen
   exactamente los mismos indicadores, en el mismo orden. Sin muestreo, sin
   azar, sin modelo estadístico.
2. **Sobre hechos activos.** Las transacciones marcadas como huérfanas por una
   reorganización se conservan como evidencia pero **no** alimentan el análisis:
   describirían una historia que la cadena ya descartó.
3. **Con procedencia.** La confianza de cada indicador se ajusta hacia abajo si
   la fuente de los datos es poco fiable. Una señal fuerte sobre un dato dudoso
   no es una señal fuerte.
4. **Sin efectos.** Evaluar no escribe en cadena, no consulta a terceros y no
   modifica los hechos ingeridos.

## Umbrales configurables

Todos viven en `config/intelligence-policies.json` y son **valores por defecto
documentados, no verdades**: deben ajustarse a la red, al activo y al tipo de
operación. Un umbral mal calibrado produce falsos positivos, no seguridad.

| Indicador | Umbral por defecto |
|---|---|
| `INT-FLOW-001` | 8 orígenes distintos en 24 h |
| `INT-FLOW-002` | 8 destinos distintos en 24 h |
| `INT-FLOW-003` | 3 saltos, ≤ 30 min entre saltos, ≥ 50 % del valor conservado |
| `INT-FLOW-004` | 3 eslabones, resto ≥ 70 %, desprendimiento ≤ 30 % |
| `INT-BEHAV-001` | 60 días de inactividad y luego 3 operaciones en 24 h |
| `INT-BEHAV-002` | 4 repeticiones con ±5 % de tolerancia en 48 h |
| `INT-BEHAV-003` | 3 direcciones distintas en 15 minutos |
| `INT-BEHAV-004` | línea base ≥ 5 operaciones; volumen ×5 o 80 % de destinos nuevos |
| `INT-EXPO-001` | 1 interacción con un contrato marcado localmente |
| `INT-EXPO-002` | 4 caracteres de prefijo o sufijo compartidos, importe ≤ dust |
| `INT-EXPO-003` | aprobación igual al máximo de `uint256` |
| `INT-EXPO-004` | 1 interacción con el conjunto local de drainers |
| `INT-ASSET-001` | 85 % del flujo observado, con ≥ 5 transferencias del activo |
| `INT-BRIDGE-001` | 2 puentes distintos en 6 horas |
| `INT-EXPLOIT-001` | movimiento dentro de las 72 h posteriores al incidente |

---

## Familia INT-FLOW · topología del movimiento de fondos

### INT-FLOW-001 · Fan-in: consolidación desde muchas direcciones

- **Severidad:** media · **Confianza por defecto:** media
- **Dispara si:** el máximo de orígenes distintos dentro de cualquier ventana
  deslizante de 24 h alcanza el umbral.
- **Evidencia:** número de orígenes únicos, transferencias en la ventana y una
  muestra de las direcciones de origen.
- **Falsos positivos característicos:** direcciones de depósito de exchange,
  contratos de recaudación, pools de minería.

> El escenario `10-falso-positivo` existe precisamente para esto: una dirección
> de depósito etiquetada dispara este indicador **y aun así el hallazgo es un
> falso positivo**. El indicador no se suprime: se activa y el puntaje lo
> atenúa por la etiqueta local. Suprimirlo escondería el patrón; atenuarlo lo
> explica.

### INT-FLOW-002 · Fan-out: dispersión hacia muchas direcciones

- **Severidad:** media
- **Dispara si:** el máximo de destinos distintos en una ventana de 24 h alcanza
  el umbral.
- **Falsos positivos característicos:** nóminas, airdrops, reembolsos y salidas
  por lotes de un exchange.

### INT-FLOW-003 · Transferencias rápidas entre múltiples wallets

- **Severidad:** alta
- **Dispara si:** el valor atraviesa al menos 3 direcciones encadenadas, con
  menos de 30 minutos entre saltos y conservando al menos el 50 % en cada uno.
- **Evidencia:** número de saltos, minutos transcurridos, la ruta completa y los
  importes de cada salto.
- **Falsos positivos característicos:** enrutamiento de agregadores DeFi,
  rebalanceo entre wallets calientes del mismo operador, bots de arbitraje.

### INT-FLOW-004 · Peeling chain

- **Severidad:** alta
- **Dispara si:** existe una cadena de al menos 3 eslabones en la que cada
  transacción desprende como máximo el 30 % del valor y traslada al menos el
  70 % a una dirección nueva.
- **Evidencia:** número de eslabones, importes desprendidos, importes del resto
  y la ruta que sigue el remanente.
- **Falsos positivos característicos:** la gestión normal de cambio en carteras
  UTXO. **Este es el indicador con mayor riesgo de falso positivo en Bitcoin**,
  porque el patrón de cambio es indistinguible del de peeling en una sola
  transacción; lo que lo hace señal es la repetición encadenada.

---

## Familia INT-BEHAV · comportamiento de la dirección

### INT-BEHAV-001 · Actividad súbita tras inactividad prolongada

- **Severidad:** media
- **Dispara si:** existe un hueco de al menos 60 días entre dos operaciones y,
  tras él, al menos 3 operaciones en 24 h.
- **Evidencia:** días de inactividad, última actividad previa, instante de
  reactivación y número de operaciones del arranque.

### INT-BEHAV-002 · Montos fraccionados repetidamente

- **Severidad:** media · **Confianza por defecto:** baja
- **Dispara si:** al menos 4 transferencias salientes tienen un importe dentro
  del ±5 % de un mismo valor de referencia, en una ventana de 48 h.
- **Por qué la confianza es baja:** el patrón de «importes casi idénticos y
  repetidos» describe igual de bien una estructuración deliberada que una
  suscripción mensual. Sin contexto comercial, no distingue.

### INT-BEHAV-003 · Comportamiento coordinado entre direcciones

- **Severidad:** media · **Confianza por defecto:** baja
- **Dispara si:** al menos 3 direcciones distintas envían al mismo destino en
  una ventana de 15 minutos.
- **Lectura correcta:** es compatible con control común, **y también** con que
  varias personas reaccionen al mismo evento público. El indicador declara la
  coordinación como hipótesis explícitamente en su explicación.

### INT-BEHAV-004 · Cambio anómalo de frecuencia, volumen o destino

- **Severidad:** media
- **Línea base:** todas las operaciones salientes anteriores a las últimas 24 h,
  exigiendo al menos 5 para que la comparación signifique algo.
- **Dispara si:** el volumen de las últimas 24 h multiplica por 5 la media
  diaria de la línea base, **o** al menos el 80 % de los destinos recientes no
  aparece en el historial.
- **Falso positivo principal:** una línea base demasiado corta. El indicador
  publica `baselineTransactions` y `baselineSpanDays` para que el analista pueda
  descartarlo de un vistazo.

---

## Familia INT-EXPO · exposición a contrapartes marcadas

### INT-EXPO-001 · Interacción con un contrato marcado localmente

- **Severidad:** alta
- **Dispara si:** la dirección interactuó con un contrato del registro local del
  operador que está marcado.
- **Evidencia:** el contrato, la etiqueta local, el motivo de la marca, el número
  de interacciones y la procedencia del registro.

> **La marca es del operador, no de un tercero.** Este producto no consulta
> ninguna lista remota de reputación: hacerlo revelaría al proveedor de la lista
> exactamente qué se está investigando. El indicador no afirma que el contrato
> sea malicioso; afirma que **está marcado**, y remite a revisar por qué y con
> qué evidencia se marcó.

### INT-EXPO-002 · Posible address poisoning en el historial

- **Severidad:** media · **Confianza:** siempre baja
- **Dispara solo si coinciden las tres señales:**
  1. la contraparte comparte al menos 4 caracteres de prefijo **o** de sufijo
     con una contraparte real de la dirección;
  2. el importe es cero o no supera el umbral de dust;
  3. la dirección no tiene relación previa registrada.
- La similitud por sí sola **nunca** activa este indicador. El escenario
  `06-address-poisoning` y su prueba negativa lo verifican: el mismo par de
  direcciones con un importe normal no produce nada.
- **Correlación:** `BLK-WALLET-005` cubre el mismo patrón sobre cuentas
  vigiladas por política; este indicador opera sobre datos ingeridos en una
  investigación. Son dominios distintos y no se duplican.

### INT-EXPO-003 · Aprobación de gasto ilimitada

- **Severidad:** alta · **Confianza por defecto:** alta
- **Dispara si:** se observa una aprobación cuyo importe es exactamente el
  máximo de `uint256`.
- **Confianza alta porque el hecho es binario:** el importe es ese o no lo es.
  Lo que sigue siendo discutible es su significado, y por eso el indicador
  declara que muchas dApp legítimas lo hacen para ahorrar gas.
- Una aprobación **no** cuenta como flujo de valor para `INT-ASSET-001`:
  autoriza gasto futuro, no mueve nada.

### INT-EXPO-004 · Coincidencia con un drainer del conjunto local

- **Severidad:** crítica
- **Dispara si:** la dirección interactuó con una entrada del conjunto local de
  drainers del operador.
- **Evidencia:** incluye siempre la advertencia de que la marca proviene del
  registro local y no de un servicio remoto.
- **Falso positivo principal:** un conjunto local desactualizado o con entradas
  mal atribuidas. La severidad crítica hace que el coste de una entrada mal
  puesta sea alto: mantener ese conjunto es responsabilidad del operador.

---

## Familia INT-ASSET · distribución de activos

### INT-ASSET-001 · Concentración inusual del flujo de un activo

- **Severidad:** baja · **Confianza:** baja
- **Dispara si:** una dirección recibe al menos el 85 % del flujo observado de
  un activo, con al menos 5 transferencias de ese activo en el conjunto.
- **Limitación declarada en la propia evidencia:** el porcentaje es sobre el
  flujo **observado en el dataset**, no sobre el suministro real del activo. Con
  una ventana pequeña, casi cualquier dirección concentra.

---

## Familia INT-BRIDGE · movimiento entre redes

### INT-BRIDGE-001 · Uso sucesivo de puentes

- **Severidad:** alta
- **Dispara si:** la dirección interactúa con al menos 2 puentes distintos del
  registro local en una ventana de 6 horas.
- **Limitación estructural:** la correlación de los fondos en la red de destino
  **no está verificada** por este producto. Se registra el patrón en la red
  observada; seguir el rastro al otro lado es trabajo manual.

---

## Familia INT-EXPLOIT · actividad posterior a un incidente

### INT-EXPLOIT-001 · Movimiento posterior a un exploit registrado

- **Severidad:** crítica
- **Dispara si:** la dirección está relacionada con un exploit del registro local
  (es la dirección del incidente o interactuó con ella) y mueve fondos dentro de
  las 72 h siguientes.
- **Advertencia incluida en la evidencia:** es una coincidencia temporal y de
  relación. **No distingue por sí sola al atacante de una acción de contención
  del equipo afectado**, que es exactamente la clase de movimiento que se
  produce en las horas siguientes a un incidente real.

---

## Escenarios de prueba reproducibles

Cada dataset de `examples/datasets/` declara qué indicadores debe producir, y
una prueba verifica que produce **exactamente** ésos: ni uno más, ni uno menos.

| Dataset | Escenario | Indicadores esperados |
|---|---|---|
| `01-actividad-normal` | Pagos normales entre dos contrapartes | *ninguno* |
| `02-fan-in` | Diez orígenes hacia una dirección | `INT-FLOW-001`, `INT-ASSET-001` |
| `03-fan-out` | Un origen hacia diez destinos | `INT-FLOW-002` |
| `04-peeling-chain` | Cadena UTXO en Bitcoin | `INT-FLOW-004` |
| `05-transferencias-rapidas` | Cuatro wallets en quince minutos | `INT-FLOW-003` |
| `06-address-poisoning` | Dirección similar con importe cero | `INT-EXPO-002` |
| `07-contrato-marcado` | Interacción con contrato marcado | `INT-EXPO-001` |
| `08-drainer-simulado` | Aprobación ilimitada y vaciado | `INT-EXPO-003`, `INT-EXPO-004` |
| `09-post-exploit` | Movimiento tras incidente registrado | `INT-EXPLOIT-001` |
| `10-falso-positivo` | Depósito etiquetado con fan-in legítimo | `INT-FLOW-001`, `INT-ASSET-001` |

El primero es tan importante como los demás: **un motor que no produce nada
sobre actividad normal es la mitad del producto.** Si una regla nueva empieza a
disparar sobre `01-actividad-normal`, la prueba falla.

Todas las direcciones y transacciones son ficticias. Las de Bitcoin son
válidas (superan la verificación de checksum base58check) y fueron generadas de
forma determinista para las fixtures. Ninguna está atribuida a nadie.

## Qué NO hace ningún indicador

- **No consulta reputación externa.** Ni listas de direcciones, ni servicios de
  terceros, ni APIs de inteligencia comercial.
- **No atribuye identidad.** Ninguna dirección se relaciona con una persona o
  entidad. Las agrupaciones son hipótesis con su nivel de confianza.
- **No infiere intención.** Describe el patrón; interpretarlo es humano.
- **No bloquea nada.** No existe una operación que congele fondos, rechace una
  transacción o marque a una contraparte fuera de este sistema local.
- **No usa aprendizaje automático.** Cada umbral está escrito, es discutible y
  se puede cambiar en un archivo de configuración.

## Añadir un indicador

Un indicador nuevo toca cuatro sitios, y `pnpm check:rules` no deja olvidarse
de ninguno:

1. `src/domain/intelligence/indicators.js` — el detector, con su código `INT-*`.
2. `config/intelligence-indicators.json` — familia, severidad, descripción, al
   menos **dos** falsos positivos posibles y una acción recomendada.
3. `config/intelligence-policies.json` — sus umbrales.
4. Este documento — su fila y su sección.

Además: un dataset en `examples/datasets/` que lo dispare, con su resultado
esperado declarado, y una prueba negativa que compruebe que **no** dispara
cuando no debe.

## Documentos relacionados

- [`RISK-MODEL.md`](RISK-MODEL.md) — cómo se convierten los indicadores en un
  puntaje explicable.
- [`BLOCKCHAIN-FORENSICS.md`](BLOCKCHAIN-FORENSICS.md) — grafo, seguimiento de
  fondos y límites del análisis.
- [`INVESTIGATION-GUIDE.md`](INVESTIGATION-GUIDE.md) — el flujo de trabajo del
  analista.
- [`DETECCION_AMENAZAS.md`](DETECCION_AMENAZAS.md) — el mapa honesto de qué
  detecta el producto entero y qué no.
