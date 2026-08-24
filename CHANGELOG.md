# Changelog

## 0.3.0 — 2026-08-24

- **RootCause Blockchain Intelligence**: dominio nuevo de análisis on-chain
  público para detectar riesgos, investigar incidentes y explicar el movimiento
  de fondos. Soporte real de **Bitcoin y Ethereum**; la arquitectura admite más
  redes, pero ninguna otra se declara soportada mientras no exista adaptador y
  pruebas.
- Modelo de datos normalizado con **validación real de direcciones**
  (base58check y bech32/bech32m verificados, no solo por formato) y montos como
  enteros exactos en unidades mínimas, nunca coma flotante.
- Pipeline de ingesta **idempotente** por red y hash, con procedencia
  obligatoria, fiabilidad por tipo de fuente y **control de reorganizaciones**:
  un bloque distinto a una altura conocida marca el anterior y sus
  transacciones como huérfanos, sin borrar nada, y los excluye del análisis.
- **15 indicadores investigativos `INT-*`** en seis familias, cada uno con
  umbral configurable, evidencia, nivel de confianza, falsos positivos posibles
  y acción recomendada. Un indicador no es una violación de política ni una
  acusación: el catálogo `BLK-*` sigue siendo independiente.
- **Puntaje de riesgo explicable** 0–100 en cuatro bandas, con factores que lo
  aumentan y lo reducen, pesos desglosados, decaimiento por antigüedad de la
  evidencia, penalización por fiabilidad de la fuente, atenuantes y
  limitaciones. No existe ninguna ruta que devuelva un puntaje sin explicación.
- **Grafo de movimiento de fondos** con cotas duras (profundidad 6, 2 000 nodos,
  8 000 aristas): recorrido hacia adelante y hacia atrás, caminos, ciclos,
  distancia a direcciones marcadas y componentes conexos. Todo resultado declara
  si está truncado.
- **Alertas con ciclo de vida** (nueva, en revisión, confirmada, falso positivo,
  mitigada, cerrada), **casos de investigación** con línea temporal, notas y
  decisiones, y **evidencia inmutable** hasheada con SHA-256 y verificable.
- **API v1 versionada** (`/api/v1/...`) con especificación OpenAPI, pensada para
  que una wallet consulte riesgo sin entregar nada privado. El análisis previo
  de una transacción es consultivo: advierte, no autoriza ni bloquea.
- **Conectores de solo lectura** (dataset local, EVM JSON-RPC, Bitcoin JSON-RPC)
  con límite de solicitudes, reintentos para fallos transitorios y métricas
  observables.
- **Diez datasets sintéticos** reproducibles, cada uno con su resultado
  esperado declarado y verificado por pruebas, incluido un escenario de
  actividad normal sin indicadores y un falso positivo documentado.
- Sección **Blockchain Intelligence** en el panel, con puntaje explicado y grafo
  dibujado en SVG sin librerías.
- Gates ampliados: coherencia del catálogo de indicadores con motor, umbrales y
  documentación; y ocho comprobaciones nuevas de frontera contra la aplicación
  real (puntaje siempre explicado, API que rechaza material privado, análisis
  consultivo, cotas del grafo, travesía de rutas y ausencia de listas remotas).
- Nueva documentación: `ONCHAIN-ANALYTICS.md`, `RISK-MODEL.md`,
  `BLOCKCHAIN-FORENSICS.md`, `DATA-MODEL.md`, `DATA-GOVERNANCE.md`,
  `INVESTIGATION-GUIDE.md`, `ADR-0002-almacenamiento-inteligencia.md` y
  `openapi-intelligence.yaml`.
- Migración segura: los estados anteriores reciben el bloque de inteligencia
  vacío sin tocar nada más.

## 0.2.0 — 2026-08-24

- **Wallet Security Posture**: nuevo dominio watch-only para cuentas públicas
  vigiladas (EOA, multisig, smart accounts, tesorerías), sin custodiar claves
  ni intervenir transacciones.
- Cuatro controles nuevos (`WALLET-ALLOWANCE`, `WALLET-COUNTERPARTY`,
  `SMART-ACCOUNT-INTEGRITY`, `WALLET-ACTIVITY`) y ocho detecciones
  (`BLK-WALLET-001` a `BLK-WALLET-008`): el catálogo pasa a **13 controles y
  22 detecciones**.
- Siete eventos wallet normalizados en `POST /api/observe/event`, con
  validación estricta, idempotencia por chain ID + transaction hash + log
  index, procedencia y nivel de confianza.
- API de cuentas vigiladas (`GET`/`POST /api/accounts`) que solo acepta
  direcciones públicas y política local; sin datos personales.
- Sección **Wallet Posture** en el dashboard: métricas, cuentas e incidentes,
  sin ningún botón de conectar, revocar, firmar, transferir ni pausar.
- Políticas configurables por activo y por red: límites de allowance, vigencia,
  spenders y operadores autorizados, contrapartes, inactividad, cadenas
  permitidas, ventanas horarias y heurística de address poisoning.
- Nueve escenarios wallet reproducibles en el modo demostración, todos con
  direcciones ficticias documentadas como fixtures.
- Diez runbooks de wallet en `docs/RUNBOOK.md`, todos de ejecución humana.
- Nuevo documento `docs/WALLET-SECURITY-BOUNDARIES.md`: frontera no negociable,
  matriz de responsabilidad de la familia y backlog de integración.
- Gate de seguridad ampliado: escaneo de capacidades de wallet prohibidas en el
  código ejecutable (`eth_send*`, `eth_sign*`, `personal_*`, `wallet_*`,
  conexión de wallet) y pruebas de runtime contra la aplicación real.
- Migración segura: los inventarios cifrados existentes reciben las colecciones
  nuevas vacías sin tocar el resto del estado.

## 0.1.0 — 2026-08-20

- Primer módulo independiente de seguridad blockchain para RootCause.
- Inventario público de proyectos, contratos, oráculos, puentes y gobernanza.
- Motor causal determinista con observación EVM de solo lectura.
- Persistencia cifrada, auditoría encadenada, API local y dashboard PWA.
- Aplicación de escritorio para Windows: edición portable e instalador por
  usuario, con el motor Node.js oficial verificado por SHA-256 al empaquetar.
- Catálogo de controles ampliado a nueve controles, cada uno con las reglas
  `BLK-*` que lo verifican.
- Gates ejecutables de calidad: claim solo-local, invariantes de seguridad
  contra la aplicación en marcha, coherencia de reglas y de documentación.
- CI en tres sistemas operativos y dos versiones de Node, análisis CodeQL,
  Dependabot para GitHub Actions y workflow de release verificado.
