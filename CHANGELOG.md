# Changelog

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
