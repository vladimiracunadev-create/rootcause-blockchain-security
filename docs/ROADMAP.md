# Roadmap

## 0.2 — entregado (2026-08-24)

- **Wallet Security Posture**: cuentas públicas vigiladas, allowances,
  operadores NFT, permits usados, address poisoning (heurístico), smart
  accounts, delegaciones EIP-7702 y actividad inesperada — 13 controles y 22
  detecciones, siempre watch-only.

## 0.3

- adaptadores de logs EVM con checkpoints y confirmaciones, incluyendo la
  traducción automática de logs `Approval`/`ApprovalForAll`/`Transfer` a los
  eventos wallet normalizados;
- adaptador Permit2 explícito y probado contra su especificación oficial;
- ingesta de SBOM, hashes de build y attestations de despliegue;
- simulación externa de upgrades sin capacidad de firma;
- exportación de evidencia hacia el RootCause principal.

## 0.4

- adaptadores Solana, Cosmos y Substrate;
- detección de cambios de validadores y gobernanza;
- modelos de topología para puentes y dependencias cross-chain;
- políticas firmadas y bundles de reglas versionados.

## No objetivos

- wallet integrada;
- bot de trading;
- custodia o firma;
- respuesta on-chain autónoma.
