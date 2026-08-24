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
- `src/domain/intelligence`: modelo normalizado, motor de indicadores, grafo de
  fondos y puntaje explicable. Todo funciones puras y deterministas.
- `src/infrastructure`: RPC EVM read-only, cifrado y auditoría.
- `src/services`: casos de uso, correlación, watchtower, conectores de
  adquisición y ciclo de vida de alertas, casos y evidencia.
- `src/api`: API HTTP local y API v1 versionada de inteligencia.
- `src/web/static`: dashboard PWA sin telemetría ni CDN.

## Dominio de inteligencia

~~~mermaid
flowchart LR
  C[Conectores read-only<br/>dataset · EVM · Bitcoin] --> P[Pipeline<br/>normalizar · deduplicar · reorgs]
  P --> H[(Hechos observados<br/>con procedencia)]
  H --> I[Motor de indicadores<br/>INT-*]
  H --> G[Grafo acotado]
  I --> S[Puntaje explicable]
  G --> S
  I --> A[Alertas]
  A --> K[Casos + evidencia hasheada]
  S --> V[API v1 · panel]
  K --> R[Informe técnico]
~~~

El flujo tiene una propiedad deliberada: **el puntaje nunca sale sin pasar por
la explicación**, y las alertas nunca disparan una acción, solo abren un caso
para una persona.

Decisión de almacenamiento y cuándo revisarla:
[`ADR-0002`](ADR-0002-almacenamiento-inteligencia.md).

## Límite con Bitcoin

Este módulo cubre aplicaciones on-chain: contratos, puentes, oráculos,
validadores, gobernanza y dependencias. Custodia Bitcoin, UTXO, PSBT, multisig y
Bitcoin Core pertenecen a `rootcause-bitcoin-defense`.

## Adaptadores

La versión inicial incluye observación EVM directa. Solana, Cosmos, Substrate y
otras redes entran mediante el endpoint de hechos normalizados o adaptadores
posteriores. El motor no depende de una librería de cadena.
