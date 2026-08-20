# Arquitectura

RootCause Blockchain Security es un paquete de dominio independiente que usa el
mismo contrato conceptual que RootCause: collectors, hechos normalizados,
reglas, correlación causal, incidentes, evidencia, runbooks y auditoría.

~~~mermaid
flowchart LR
  A[RPC e indexadores read-only] --> N[Normalización]
  B[Inventario y artefactos públicos] --> N
  C[CI, SBOM y despliegues] --> N
  N --> R[Motor determinista]
  R --> I[Incidentes causales]
  I --> E[Evidencia y runbooks]
  I -. resumen opcional .-> AI[IA sin autoridad]
~~~

## Componentes

- `src/domain`: validación, guardia de secretos y reglas puras.
- `src/infrastructure`: RPC EVM read-only, cifrado y auditoría.
- `src/services`: casos de uso, correlación y watchtower.
- `src/api`: API HTTP local.
- `src/web/static`: dashboard PWA sin telemetría ni CDN.

## Límite con Bitcoin

Este módulo cubre aplicaciones on-chain: contratos, puentes, oráculos,
validadores, gobernanza y dependencias. Custodia Bitcoin, UTXO, PSBT, multisig y
Bitcoin Core pertenecen a `rootcause-bitcoin-defense`.

## Adaptadores

La versión inicial incluye observación EVM directa. Solana, Cosmos, Substrate y
otras redes entran mediante el endpoint de hechos normalizados o adaptadores
posteriores. El motor no depende de una librería de cadena.
