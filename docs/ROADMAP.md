# Roadmap

## 0.2 — entregado (2026-08-24)

- **Wallet Security Posture**: cuentas públicas vigiladas, allowances,
  operadores NFT, permits usados, address poisoning (heurístico), smart
  accounts, delegaciones EIP-7702 y actividad inesperada — 13 controles y 22
  detecciones, siempre watch-only.

## 0.3 — entregado (2026-08-24)

- **RootCause Blockchain Intelligence**: ingesta idempotente con control de
  reorganizaciones, 15 indicadores investigativos, puntaje explicable, grafo
  acotado de movimiento de fondos, alertas, casos, evidencia inmutable y API v1
  con OpenAPI. Bitcoin y Ethereum.

## 0.4 — siguiente incremento

Etapa 3 del dominio de inteligencia, **explícitamente no implementada hoy**:

- anomalías estadísticas sobre la línea base de cada dirección, con su tasa de
  error declarada;
- correlación cross-chain real: emparejar la entrada y la salida de un puente
  entre dos redes, con confianza medida en vez de supuesta;
- métricas de calidad del motor: precisión por indicador a partir de los falsos
  positivos que los analistas registran;
- adaptadores de logs EVM con checkpoints y confirmaciones, incluyendo la
  traducción automática de logs `Approval`/`ApprovalForAll`/`Transfer` a los
  eventos wallet normalizados;
- adaptador Permit2 explícito y probado contra su especificación oficial;
- almacenamiento embebido (SQLite o DuckDB) si se cumplen los umbrales de
  [`ADR-0002`](ADR-0002-almacenamiento-inteligencia.md).

Los modelos de aprendizaje automático se mantienen **opcionales y fuera del
camino crítico**: un puntaje que no se puede explicar no puede sostener una
decisión sobre el dinero de nadie.

## 0.5

- adaptadores Solana, Cosmos y Substrate;
- detección de cambios de validadores y gobernanza;
- modelos de topología para puentes y dependencias cross-chain;
- políticas firmadas y bundles de reglas versionados.

## No objetivos

- wallet integrada;
- bot de trading;
- custodia o firma;
- respuesta on-chain autónoma.
