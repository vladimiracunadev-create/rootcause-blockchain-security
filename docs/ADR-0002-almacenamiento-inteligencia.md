# ADR-0002 · Almacenamiento del dominio de inteligencia

**Estado:** aceptada · **Fecha:** 2026-08-24 · **Ámbito:** RootCause Blockchain
Intelligence (MVP y etapa de investigación)

## Contexto

El dominio de inteligencia introduce cargas de trabajo que normalmente empujan
hacia infraestructura dedicada:

- **entidades y casos** → base de datos relacional;
- **volúmenes grandes de transacciones** → base analítica columnar;
- **relaciones y recorridos** → base de grafos;
- **consultas repetidas** → caché;
- **evidencia** → almacenamiento inmutable.

Al mismo tiempo, el producto tiene propiedades que no son negociables y que
existían antes que este dominio: **cero dependencias externas**, ejecución
**local**, funcionamiento **offline**, y distribución como **aplicación de
escritorio para Windows** que un operador descomprime y ejecuta. Tres gates de
CI las verifican en cada cambio.

Añadir PostgreSQL, ClickHouse, Neo4j o Redis al MVP habría significado:

1. romper el claim de cero dependencias que el propio producto audita en otros;
2. convertir una aplicación de escritorio en un despliegue con servicios;
3. exigir al operador administrar, respaldar y asegurar cuatro sistemas más;
4. multiplicar la superficie de ataque de una herramienta cuya propuesta es
   precisamente reducirla.

## Decisión

**El MVP y la etapa de investigación usan el almacenamiento que ya existe:** el
estado cifrado con AES-256-GCM en un único archivo, más un grafo construido en
memoria bajo demanda y acotado.

Concretamente:

| Necesidad | Solución adoptada |
|---|---|
| Entidades y casos | Colecciones dentro del estado cifrado existente |
| Volumen | Cotas explícitas por colección, con recorte por antigüedad |
| Grafo | `buildFundsGraph()` en memoria, reconstruido por consulta, con techos duros |
| Caché | Ninguna. Las consultas se recalculan; el conjunto acotado lo permite |
| Evidencia inmutable | Hash SHA-256 al crear, sin operación de edición, sobre la auditoría encadenada existente |

Las cotas vigentes están en `LIMITS` (`src/services/intelligence-service.js`):
20 000 transacciones, 5 000 bloques, 5 000 indicadores, 2 000 alertas, 5 000
evidencias y 500 casos.

## Consecuencias

### A favor

- El producto sigue siendo un ejecutable que arranca sin instalar nada.
- Cero dependencias, cero telemetría y funcionamiento offline se mantienen, y
  los gates que los verifican siguen pasando.
- La evidencia y la auditoría reutilizan un mecanismo ya probado en lugar de
  introducir un modelo de integridad nuevo.
- El grafo en memoria es determinista y trivialmente reproducible: no hay
  estado intermedio que pueda quedar desincronizado.

### En contra, y asumido

- **El grafo se reconstruye en cada consulta.** Con las cotas actuales el coste
  es aceptable; con volúmenes mucho mayores dejaría de serlo.
- **No hay consultas analíticas ad hoc.** No se puede preguntar «dame todas las
  direcciones que recibieron más de X en el último trimestre» sin escribir
  código.
- **El estado completo se carga en memoria** al leer. Es lo que ya hacía el
  producto; el dominio de inteligencia lo hace más caro.
- **El recorte por antigüedad descarta datos.** Al superar la cota, las
  transacciones más antiguas salen del estado. Para una investigación que
  necesite conservar todo, el camino es exportar el informe del caso, que
  incluye la evidencia con su hash.

## Cuándo revisar esta decisión

Esta decisión deja de ser correcta cuando se cumpla cualquiera de estas
condiciones, y entonces hay que volver a abrirla:

| Señal | Umbral orientativo | Hacia dónde mirar |
|---|---|---|
| Volumen de transacciones ingeridas | > 100 000 sostenidas | Base analítica embebida (SQLite/DuckDB) antes que un servicio |
| Latencia de una consulta de grafo | > 2 s de forma habitual | Índice persistente de aristas, o base de grafos |
| Necesidad de consultas ad hoc por analistas | Recurrente | Base relacional embebida |
| Varios analistas concurrentes | > 1 escritor real | Servidor con transacciones, y entonces sí un despliegue |

El orden de preferencia al revisarla debe ser: **primero embebido y sin
servicio** (SQLite, DuckDB), y solo después un servicio externo. Un motor
embebido conserva la propiedad de «un ejecutable que arranca»; un servicio la
destruye.

## Alternativas consideradas

- **SQLite embebido desde el principio.** Habría dado consultas ad hoc y menor
  huella de memoria, a cambio de una dependencia nativa (o del módulo
  experimental `node:sqlite`) y de un esquema que mantener. Se descartó para el
  MVP porque el conjunto acotado no lo necesita todavía, no porque sea mala
  idea: es la primera opción cuando se revise esta decisión.
- **Base de grafos dedicada.** Resuelve exactamente el problema de recorridos,
  y exige un servicio, un lenguaje de consulta y una operación completa. No se
  justifica para 2 000 nodos como techo.
- **Caché de evaluaciones.** Se descartó porque introduce la posibilidad de
  servir un puntaje obsoleto sin decirlo, y este producto se define por no
  presentar un resultado sin declarar su alcance temporal.

## Relación con ADR-0001

[`ADR-0001`](ADR-0001-plataforma-y-lenguaje.md) decidió escritorio local sobre
SaaS y Node sin dependencias. Esta decisión es su consecuencia directa aplicada
a un dominio con apetito de infraestructura: cuando la arquitectura y la
funcionalidad tiran en direcciones opuestas, gana la propiedad que el usuario
puede verificar.
