# Modelo de riesgo explicable

Un número sin explicación es lo peor que puede producir una herramienta como
ésta: nadie puede discutirlo, corregirlo ni auditarlo, y termina usándose como
si fuera un veredicto. Este documento define exactamente cómo se calcula el
puntaje, qué significa y qué **no** significa.

Fuente de verdad: `src/domain/intelligence/risk-score.js`. Pesos y umbrales:
`config/intelligence-policies.json`, sección `scoring`.

## Qué mide el puntaje

**Exposición a señales investigables sobre los datos ingeridos.** Nada más.

No mide culpabilidad, no mide probabilidad de delito y no mide la calidad moral
de nadie. Un puntaje alto significa «aquí hay varias cosas que una persona
debería mirar»; un puntaje bajo significa «en los datos que tengo no aparece
nada», que es una afirmación mucho más débil que «esto es seguro».

Por eso el resultado **siempre** incluye `requiresHumanReview: true`. No es
decorativo: no existe ninguna ruta en el código que produzca una decisión
automática a partir del puntaje.

## Bandas

| Puntaje | Banda | Etiqueta |
|---|---|---|
| 0 – 24 | `low` | Bajo |
| 25 – 49 | `moderate` | Moderado |
| 50 – 74 | `high` | Alto |
| 75 – 100 | `critical` | Crítico |

La banda nunca viaja sin su etiqueta ni sin los factores que la produjeron.
`describeBand()` existe para consultar una banda ya calculada, no para obtener
un número desnudo.

## Cómo se compone

El puntaje es la suma de factores que **aumentan** y factores que **reducen**,
recortada al rango 0–100. Cada factor lleva su identificador, su etiqueta
legible, sus puntos, el desglose de su peso y su nivel epistémico.

### 1. Indicadores activos

Por cada indicador **distinto** que aplica al sujeto:

```text
puntos = (peso_de_severidad + bonificación_por_repetición)
         × factor_de_antigüedad
         × multiplicador_de_confianza
```

| Componente | Valor |
|---|---|
| Peso por severidad | crítica 40 · alta 26 · media 14 · baja 6 |
| Bonificación por repetición | +3 por cada ocurrencia adicional, hasta +12 |
| Multiplicador de confianza | alta ×1 · media ×0,85 · baja ×0,7 |
| Factor de antigüedad | decaimiento exponencial, semivida 90 días, suelo 40 % |

La repetición se cuenta por indicador, no por evidencia: tres apariciones del
mismo patrón pesan más que una, pero no tres veces más. Un patrón repetido es
más sólido; no es un problema tres veces mayor.

### 2. Cercanía en el grafo

| Distancia a una dirección marcada localmente | Puntos |
|---|---|
| 0 (el propio sujeto está marcado) | 30 |
| 1 salto | 18 |
| 2 saltos | 10 |
| 3 saltos | 5 |
| 4 saltos | 2 |

El factor lleva siempre esta advertencia adjunta: **la proximidad en el grafo
no implica relación ni participación.** Una dirección puede recibir fondos sin
conocer su origen, y a partir de dos o tres saltos la mayoría de las direcciones
de una red están conectadas con casi todo. Por eso los puntos caen rápido con
la distancia y se detienen en cuatro saltos.

### 3. Penalización por fiabilidad de la fuente

Se descuenta hasta 15 puntos en proporción a la fiabilidad más baja entre las
fuentes que sostienen los indicadores:

```text
penalización = (1 − fiabilidad_mínima) × 15
```

| Tipo de fuente | Fiabilidad |
|---|---|
| Nodo propio | 1,00 |
| Dataset local | 0,90 |
| Indexador | 0,75 |
| Explorador público | 0,60 |
| Inteligencia de terceros | 0,50 |
| Desconocida | 0,30 |

Una fuente desconocida no se trata como fiable por defecto: se degrada al valor
más bajo. Esto tiene un efecto deliberado: **el mismo conjunto de indicadores
produce un puntaje menor si los datos vienen de una fuente peor.**

### 4. Factores atenuantes

| Factor | Puntos | Cuándo aplica |
|---|---|---|
| Contraparte etiquetada localmente | −12 | El operador la registró con una etiqueta y sin marcar |
| Historial largo y consistente | −8 | ≥ 180 días de actividad observada sin cambio de patrón |
| Aprobación revocada después | −10 | Se observó una revocación posterior que cierra la exposición |
| Un único indicador de baja confianza | −6 | Una sola señal débil no sostiene una calificación alta |

El caso de la contraparte etiquetada es el que hace útil al modelo en la
práctica. Una dirección de depósito de un exchange dispara `INT-FLOW-001`
legítimamente cada día. El indicador **no se suprime** —eso escondería el
patrón y haría el motor inauditable—: se activa, y la etiqueta local del
operador baja el puntaje y deja constancia de por qué.

## Confianza del análisis

La confianza es **independiente del puntaje** y responde a otra pregunta: no
«cuánto riesgo hay» sino «cuánto respalda la evidencia a este resultado».

| Confianza | Condición |
|---|---|
| `high` | ≥ 3 indicadores distintos **y** fiabilidad mínima ≥ 0,75 |
| `medium` | ≥ 1 indicador **y** fiabilidad mínima ≥ 0,50 |
| `low` | el resto |

Un puntaje de 80 con confianza baja y un puntaje de 80 con confianza alta son
resultados muy distintos, y el sistema no los presenta igual.

## Limitaciones, siempre presentes

Todo resultado incluye al menos estas tres, y añade más según el caso:

1. El puntaje mide exposición a señales investigables sobre los datos
   ingeridos; no es una prueba, ni una acusación, ni una atribución de
   identidad.
2. Solo se evaluaron los hechos presentes en el conjunto analizado: **la
   ausencia de indicadores no demuestra ausencia de riesgo.**
3. Ninguna dirección se relaciona con una persona o entidad: este sistema no
   produce identidades verificadas.

Se añaden automáticamente cuando corresponde:

- si no se activó ningún indicador, que el resultado refleja falta de señales y
  no una verificación positiva;
- si la búsqueda de proximidad se truncó por los límites del grafo, que la
  distancia real podría ser menor;
- si la fiabilidad de la fuente es baja, que hay que verificar en una segunda
  fuente independiente.

## Recomendación

El puntaje se traduce en una recomendación de **proceso**, nunca en una acción
sobre los fondos:

| Puntaje | Recomendación |
|---|---|
| ≥ 75 | Revisión humana prioritaria: preservar evidencia y abrir un caso antes de decidir nada |
| ≥ 50 | Revisión humana: contrastar los indicadores con una segunda fuente antes de escalar |
| ≥ 25 | Revisión cuando haya capacidad: registrar el resultado y vigilar nuevas señales |
| < 25 | Sin señales relevantes en los datos analizados; conservar como línea base |

## Versionado del modelo

Cada evaluación incluye `modelVersion` (hoy `intelligence-1.0.0`). Un puntaje
sin versión de modelo no es reproducible: si los pesos cambian, los resultados
anteriores dejan de ser comparables y hay que saberlo. Cualquier cambio en los
pesos o en las bandas exige subir esa versión.

## Lo que este modelo deliberadamente no hace

- **No usa aprendizaje automático.** Cada punto del puntaje se puede rastrear
  hasta un factor con nombre y un número en un archivo de configuración. Un
  modelo entrenado sería probablemente mejor detectando y sería, con seguridad,
  imposible de explicar ante una reclamación.
- **No pondera con datos de mercado ni precios.** No hay conversión a valor
  fiat: los importes son enteros en la unidad mínima del activo.
- **No incorpora reputación externa.** Ninguna consulta sale de la máquina.
- **No decide.** No hay umbral que dispare un bloqueo, un rechazo ni un aviso a
  un tercero.

## Documentos relacionados

- [`ONCHAIN-ANALYTICS.md`](ONCHAIN-ANALYTICS.md) — los quince indicadores que
  alimentan el puntaje.
- [`BLOCKCHAIN-FORENSICS.md`](BLOCKCHAIN-FORENSICS.md) — el grafo del que sale
  el factor de proximidad.
- [`INVESTIGATION-GUIDE.md`](INVESTIGATION-GUIDE.md) — cómo se usa un puntaje en
  una investigación real.
