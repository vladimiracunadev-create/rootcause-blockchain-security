# RootCause Blockchain Security

```text
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                   ║
║  ██████╗  ██████╗  ██████╗ ████████╗ ██████╗  █████╗ ██╗   ██╗███████╗███████╗    ║
║  ██╔══██╗██╔═══██╗██╔═══██╗╚══██╔══╝██╔════╝ ██╔══██╗██║   ██║██╔════╝██╔════╝    ║
║  ██████╔╝██║   ██║██║   ██║   ██║   ██║      ███████║██║   ██║███████╗█████╗      ║
║  ██╔══██╗██║   ██║██║   ██║   ██║   ██║      ██╔══██║██║   ██║╚════██║██╔══╝      ║
║  ██║  ██║╚██████╔╝╚██████╔╝   ██║   ╚██████╗ ██║  ██║╚██████╔╝███████║███████╗    ║
║  ╚═╝  ╚═╝ ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚══════╝╚══════╝      ║
║                                                                                   ║
║                   B L O C K C H A I N   S E C U R I T Y                           ║
║          Consola watch-only multi-chain · Node sin dependencias · v0.3.0          ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
```

[![CI](https://github.com/vladimiracunadev-create/rootcause-blockchain-security/actions/workflows/ci.yml/badge.svg)](https://github.com/vladimiracunadev-create/rootcause-blockchain-security/actions/workflows/ci.yml)
[![CodeQL](https://github.com/vladimiracunadev-create/rootcause-blockchain-security/actions/workflows/codeql.yml/badge.svg)](https://github.com/vladimiracunadev-create/rootcause-blockchain-security/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.12-green.svg)](package.json)
[![Dependencias](https://img.shields.io/badge/dependencias-0-success.svg)](docs/ADR-0001-plataforma-y-lenguaje.md)
[![Telemetría](https://img.shields.io/badge/telemetr%C3%ADa-cero-success.svg)](docs/THREAT_MODEL.md)
[![Claves](https://img.shields.io/badge/claves%20privadas-nunca-success.svg)](SECURITY.md)
[![Versión](https://img.shields.io/badge/versi%C3%B3n-0.3.0-brightgreen.svg)](CHANGELOG.md)

🌐 **[Página del producto →](https://vladimiracunadev-create.github.io/rootcause-blockchain-security/)**  ·  ⬇️ **[Descargar para Windows →](https://github.com/vladimiracunadev-create/rootcause-blockchain-security/releases/latest)**  ·  📘 **[Índice de documentación →](docs/INDEX.md)**

---

**Aplicación de escritorio local y watch-only** para inventariar aplicaciones
blockchain, detectar fallas de control, correlacionar eventos on-chain y
producir incidentes causales **sin custodiar claves ni ejecutar transacciones**.

En una cadena programable puedes tener las claves perfectas y perderlo todo
igual: porque una EOA olvidada seguía siendo `owner` de un proxy, porque un
oráculo dejó de actualizarse, o porque un puente con quorum 2-de-3 tenía los tres
firmantes en la misma nube. **Eso es lo que este producto vigila.**

> **Diagnóstico primero. Intervención después.**

![Panel de RootCause Blockchain Security: riesgo causal consolidado en 100 sobre 100 con exposición crítica, cuatro métricas de inventario multi-chain, la ruta causal de la condición al impacto y el estado del observador RPC](docs/img/panel-resumen.png)

Es el producto hermano de
[rootcause-bitcoin-defense](https://github.com/vladimiracunadev-create/rootcause-bitcoin-defense):
comparte el núcleo RootCause, pero mantiene separado el dominio de contratos
inteligentes, puentes, oráculos, gobernanza y cadena de suministro. La diferencia
entre «blockchain» y «Bitcoin» —y por qué son dos repositorios— está en
[`docs/BLOCKCHAIN-Y-BITCOIN.md`](docs/BLOCKCHAIN-Y-BITCOIN.md).

---

## ⬇️ Descargar

Aplicación de escritorio para Windows, en dos formatos con el mismo contenido:

| Formato | Archivo | Cuándo usarlo |
| --- | --- | --- |
| **Instalador** | `RootCause-Blockchain-Security-<versión>-win-x64-setup.exe` | Uso normal. Instala por usuario, **sin permisos de administrador**. |
| **Portable** | `RootCause-Blockchain-Security-<versión>-win-x64-portable.zip` | Descomprimir y ejecutar. Sin instalar nada. |

Ninguno requiere Node.js instalado: el motor oficial viaja dentro, **verificado
por SHA-256** contra `SHASUMS256.txt` de nodejs.org al empaquetar. Cada release
incluye `SHA256SUMS.txt` para verificar la descarga.

~~~powershell
Get-FileHash .\RootCause-Blockchain-Security-0.3.0-win-x64-setup.exe -Algorithm SHA256
~~~

Detalles de instalación, configuración y verificación en
[`docs/WINDOWS-APP.md`](docs/WINDOWS-APP.md).

---

## 🔍 Qué ve, y qué te dice

### Postura de seguridad

Un semáforo que **siempre explica por qué está en el color en que está**: la ruta
causal completa, de la condición sistémica al impacto, con la evidencia pública
que la sostiene.

### Incidentes con causa raíz, no alertas sueltas

![Lista de incidentes de RootCause: diecinueve hallazgos ordenados por severidad, cada uno con su código BLK, la entidad afectada y una explicación en una línea](docs/img/panel-incidentes.png)

Cada incidente abre con lo que un operador necesita para decidir: explicación,
**causa raíz**, evidencia conservada y remediación segura.

![Detalle del incidente BLK-ACCESS-001: control administrativo concentrado en una EOA, con explicación, causa raíz, evidencia con projectId y dirección, y dos pasos de remediación segura](docs/img/incidente-detalle.png)

### Inventario multi-chain

![Inventario multi-chain: dos proyectos con su cadena y criticidad, contadores de contratos, oráculos, puentes y dependencias, y las direcciones públicas de cada contrato](docs/img/panel-inventario.png)

Solo **procedencia y controles verificables**. Sin secretos, sin firmas, sin
credenciales.

### Wallet Posture: cuentas públicas vigiladas

Inventario watch-only de EOA, multisig, smart accounts y tesorerías, con
detección de allowances ilimitados, spenders fuera de política, operadores NFT,
permits usados, candidatos de address poisoning, cambios de smart account,
delegaciones EIP-7702 y actividad inesperada. **Sin conectar wallet, sin
revocar, sin firmar**: cada hallazgo remite a un runbook humano.

![Panel Wallet Posture: ocho métricas de postura de wallets, cinco cuentas públicas vigiladas con su criticidad y los incidentes de wallet activos con su código BLK-WALLET](docs/img/panel-wallet.png)

Las fronteras exactas —lo que este dominio nunca hará y qué producto RootCause
cubre cada superficie— están en
[`docs/WALLET-SECURITY-BOUNDARIES.md`](docs/WALLET-SECURITY-BOUNDARIES.md).

### Blockchain Intelligence: investigar, no acusar

![Panel de Blockchain Intelligence: métricas de análisis on-chain, buscador de riesgo por dirección, grafo acotado de movimiento de fondos y alertas de inteligencia](docs/img/panel-intelligence.png)

Análisis de datos **públicos** de Bitcoin y Ethereum: **15 indicadores
investigativos** `INT-*` (fan-in, fan-out, peeling chains, transferencias
rápidas, address poisoning, aprobaciones ilimitadas, exposición a direcciones
marcadas localmente, actividad posterior a un exploit…), un **puntaje de riesgo
0–100 que nunca viaja sin su explicación**, seguimiento de fondos sobre un grafo
con límites duros, y alertas, casos y evidencia hasheada para una investigación
con trazabilidad.

Lo que este dominio **no** hace, por diseño: no consulta listas remotas de
reputación, no atribuye identidad a una dirección, no infiere intención y no
bloquea fondos. Cada resultado separa **hecho observado**, **indicador**,
**inferencia** e **hipótesis**, y ninguna de esas categorías asciende sola.

Detalle en [`docs/ONCHAIN-ANALYTICS.md`](docs/ONCHAIN-ANALYTICS.md) y
[`docs/RISK-MODEL.md`](docs/RISK-MODEL.md).

### Trece controles, veintidós detecciones

![Catálogo de trece controles de defensa, de la procedencia de bytecode a la actividad de wallets, y el núcleo RootCause compartido con Bitcoin Defense](docs/img/panel-controles.png)

---

## 🛡️ Principios no negociables

1. Nunca solicita ni almacena frases semilla, claves privadas, keystores,
   credenciales RPC, firmas pendientes o transacciones sin publicar.
2. No firma, construye ni transmite transacciones.
3. JSON-RPC usa una allowlist estricta de métodos de lectura.
4. RPC acepta localhost por defecto; destinos remotos requieren habilitación
   explícita y controles de red externos.
5. Las reglas son deterministas. La IA es opcional y no tiene autoridad.
6. Toda acción privilegiada exige un runbook y aprobación humana separada.

Estos seis puntos **no son una declaración de intenciones**:
`scripts/check-security-claims.js` los comprueba arrancando la aplicación real y
golpeándola con peticiones hostiles —claves privadas, mnemónicos, keystores,
tokens de proveedor, mutaciones sin cabecera y peticiones cross-site—, y CI no
deja pasar un cambio que los incumpla.

---

## ⚡ Empezar en 30 segundos

Requisitos para desarrollo: Node.js 22.12 o superior y pnpm 11. **No hay
dependencias externas.**

~~~bash
corepack enable
pnpm start
~~~

Abre http://127.0.0.1:8790. El modo demo usa datos ficticios y memoria: nada se
escribe en disco.

Para construir la aplicación de escritorio:

~~~bash
pnpm package:windows
~~~

---

## ✅ Verificación

~~~bash
pnpm check
~~~

Encadena las seis puertas que también corren en CI:

| Puerta | Qué comprueba |
| --- | --- |
| `pnpm lint` | Estructura del repositorio, JSON válido, sintaxis y ausencia de material privado embebido |
| `pnpm test` | Pruebas unitarias y de integración |
| `pnpm check:local-only` | Cero dependencias, cero orígenes remotos, cero proveedores RPC alojados, CSP self-only |
| `pnpm check:security` | Arranca la aplicación y verifica los seis principios contra peticiones hostiles |
| `pnpm check:rules` | El motor, el catálogo de controles, la política y el README describen el mismo conjunto de reglas |
| `pnpm check:docs` | Ningún documento enlaza a un archivo inexistente |

CI añade una séptima: **empaqueta la aplicación de escritorio y la arranca**
para comprobar que sirve el panel con inventario dentro. Un ZIP del tamaño
esperado no prueba que la aplicación funcione.

Si Corepack no puede consultar la red, ejecuta los equivalentes sin descarga:

~~~bash
node scripts/validate-repo.js
node --test
~~~

---

## 🔐 Persistencia cifrada

~~~bash
pnpm generate:data-key

DEMO_MODE=false \
ROOTCAUSE_DATA_KEY="valor-generado" \
pnpm start
~~~

El estado se cifra con **AES-256-GCM** y la auditoría se encadena con SHA-256. La
clave de cifrado nunca se escribe en el repositorio, y si la pierdes no hay
recuperación posible.

---

## 📡 Observador EVM

Por defecto se conecta únicamente a `127.0.0.1:8545` y solo puede invocar:

`eth_chainId` · `eth_blockNumber` · `eth_getBlockByNumber` · `eth_getCode` ·
`eth_getStorageAt` · `eth_call` · `eth_getLogs` · `net_version` ·
`web3_clientVersion`

~~~bash
DEMO_MODE=false \
ROOTCAUSE_DATA_KEY="valor-generado" \
EVM_RPC_URL="http://127.0.0.1:8545" \
EVM_EXPECTED_CHAIN_ID=1 \
WATCHTOWER_ENABLED=true \
pnpm start
~~~

La allowlist es defensa en profundidad; no sustituye aislamiento, autenticación
RPC ni verificación independiente del proveedor. Un endpoint remoto exige además
`EVM_ALLOW_REMOTE_RPC=true`, y conviene saber lo que implica: **el proveedor al
que consultes ve qué contratos estás vigilando.**

Solana, Cosmos, Substrate y otras redes pueden enviar hechos ya normalizados a
`POST /api/observe/event` sin acoplar el motor de reglas a ningún SDK. Esas
redes **no se declaran soportadas** mientras no existan adaptadores y pruebas
reales: hoy el soporte implementado es EVM.

El mismo endpoint acepta los siete eventos wallet normalizados
(`wallet.allowance.changed`, `wallet.operator.changed`, `wallet.permit.used`,
`wallet.transfer.observed`, `wallet.smart-account.changed`,
`wallet.delegation.changed`, `wallet.activity.observed`), con validación
estricta, idempotencia por chain ID + transaction hash + log index y rechazo de
material de firma en cualquier profundidad.

---

## 📋 Reglas incluidas

| Código | Control | Detección |
| --- | --- | --- |
| BLK-CONTRACT-001 | SC-PROVENANCE | Fuente desplegada sin procedencia verificada |
| BLK-ACCESS-001 | ADMIN-CONTAINMENT | Admin crítico controlado por una EOA |
| BLK-ACCESS-002 | ADMIN-CONTAINMENT | Multisig administrativo con umbral débil |
| BLK-UPGRADE-001 | ADMIN-CONTAINMENT | Upgrade sin demora mínima |
| BLK-ORACLE-001 | ORACLE-RESILIENCE | Oráculo concentrado y sin fallback |
| BLK-ORACLE-002 | ORACLE-RESILIENCE | Feed vencido respecto de su heartbeat |
| BLK-BRIDGE-001 | BRIDGE-QUORUM | Puente con quorum u operadores insuficientes |
| BLK-GOV-001 | GOVERNANCE-DELAY | Timelock de gobernanza inferior a política |
| BLK-SUPPLY-001 | SUPPLY-CHAIN | Dependencia no fijada o sin procedencia |
| BLK-EVENT-001 | CHANGE-APPROVAL | Cambio privilegiado sin aprobación registrada |
| BLK-FUNDS-001 | VALUE-EGRESS | Salida de valor anómala no aprobada |
| BLK-NODE-001 | OBSERVER-INTEGRITY | Observador RPC no disponible |
| BLK-NODE-002 | OBSERVER-INTEGRITY | RPC conectado al chain ID equivocado |
| BLK-NODE-003 | OBSERVER-INTEGRITY | Observador atrasado |
| BLK-WALLET-001 | WALLET-ALLOWANCE | Allowance ilimitado o superior a política |
| BLK-WALLET-002 | WALLET-COUNTERPARTY | Spender no reconocido por la política local |
| BLK-WALLET-003 | WALLET-ALLOWANCE | Operador NFT (ApprovalForAll) fuera de política |
| BLK-WALLET-004 | WALLET-ALLOWANCE | Permit utilizado fuera de política |
| BLK-WALLET-005 | WALLET-COUNTERPARTY | Posible address poisoning (candidato heurístico) |
| BLK-WALLET-006 | SMART-ACCOUNT-INTEGRITY | Cambio inesperado en smart account |
| BLK-WALLET-007 | SMART-ACCOUNT-INTEGRITY | Delegación EOA EIP-7702 inesperada |
| BLK-WALLET-008 | WALLET-ACTIVITY | Actividad inesperada de una cuenta vigilada |

Los controles están definidos en `config/control-catalog.json` y los umbrales en
`config/policies.json`. `pnpm check:rules` impide que se desincronicen.

---

## 🔌 API mínima

~~~bash
curl http://127.0.0.1:8790/api/summary

curl -X POST http://127.0.0.1:8790/api/scan \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data "{}"
~~~

La API de inteligencia está **versionada** y documentada en OpenAPI. Una wallet
puede consultar el riesgo de un destino sin entregar nada privado:

~~~bash
curl http://127.0.0.1:8790/api/v1/risk/addresses/ethereum/0x…
~~~

La respuesta trae puntaje, banda, confianza, los factores que lo componen con su
peso, la evidencia, las limitaciones y la versión del modelo. **Nunca un número
suelto.** Esa API no pide claves ni semillas, y su análisis previo de una
transacción es consultivo: advierte, no autoriza ni bloquea.

Contrato completo en [`docs/API.md`](docs/API.md) y
[`docs/openapi-intelligence.yaml`](docs/openapi-intelligence.yaml).

---

## 📁 Estructura

~~~text
config/                  Políticas, catálogo de controles y catálogo de indicadores
docs/                    Arquitectura, amenazas, decisiones, runbooks y capturas
examples/                Proyectos y eventos públicos ficticios
examples/datasets/       Diez escenarios sintéticos con su resultado esperado
landing/                 Página de producto publicada en GitHub Pages
packaging/windows/       Empaquetado de escritorio: portable, instalador e icono
scripts/                 Validación, gates de seguridad y utilidades
src/api/                 API HTTP local y API v1 de inteligencia
src/domain/              Validación, reglas y protección de secretos
src/domain/intelligence/ Modelo normalizado, indicadores, grafo y puntaje
src/infrastructure/      RPC EVM, cifrado y auditoría
src/services/            Casos de uso, conectores, watchtower e investigación
src/web/static/          Dashboard responsive y PWA
test/                    Pruebas unitarias e integración
~~~

---

## 📚 Documentación

| Documento | Contenido |
| --- | --- |
| [`docs/INDEX.md`](docs/INDEX.md) | **Índice completo**, con la puerta de CI que verifica cada afirmación |
| [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | Qué es cada cosa del panel, en claro |
| [`docs/HEURISTICAS.md`](docs/HEURISTICAS.md) | Especificación exacta de las 22 reglas |
| [`docs/WALLET-SECURITY-BOUNDARIES.md`](docs/WALLET-SECURITY-BOUNDARIES.md) | Fronteras de la postura de wallets y matriz de la familia |
| [`docs/ONCHAIN-ANALYTICS.md`](docs/ONCHAIN-ANALYTICS.md) | Los 15 indicadores de inteligencia, con umbrales y falsos positivos |
| [`docs/RISK-MODEL.md`](docs/RISK-MODEL.md) | Cómo se calcula un puntaje explicable y por qué nunca va solo |
| [`docs/BLOCKCHAIN-FORENSICS.md`](docs/BLOCKCHAIN-FORENSICS.md) | Grafo, seguimiento de fondos y límites del análisis |
| [`docs/INVESTIGATION-GUIDE.md`](docs/INVESTIGATION-GUIDE.md) | Flujo de trabajo del analista, de la ingesta al informe |
| [`docs/DETECCION_AMENAZAS.md`](docs/DETECCION_AMENAZAS.md) | Mapa honesto: qué detecta hoy y qué no |
| [`docs/ADR-0001-plataforma-y-lenguaje.md`](docs/ADR-0001-plataforma-y-lenguaje.md) | Por qué escritorio y no SaaS; por qué Node hoy, Rust después y no Go |
| [`docs/BLOCKCHAIN-Y-BITCOIN.md`](docs/BLOCKCHAIN-Y-BITCOIN.md) | Qué es cada cosa y por qué son dos productos |
| [`docs/WINDOWS-APP.md`](docs/WINDOWS-APP.md) | Construir, configurar, verificar y publicar la aplicación |
| [`docs/FAMILIA_ROOTCAUSE.md`](docs/FAMILIA_ROOTCAUSE.md) | Las seis ediciones y cuál usar en cada caso |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Capas, flujo de datos y decisiones internas |
| [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) | Amenazas consideradas y fuera de alcance |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Respuesta operativa a incidentes |
| [`docs/SECURITY-CHECKLIST.md`](docs/SECURITY-CHECKLIST.md) | Antes de usar datos reales |
| [`docs/COMMANDS.md`](docs/COMMANDS.md) | Referencia de comandos, variables de entorno y API |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Problemas comunes y su causa real |
| [`docs/CI_GITHUB.md`](docs/CI_GITHUB.md) | Los cuatro workflows y qué protege cada uno |
| [`docs/POLITICA_DE_PRIVACIDAD_LOCAL.md`](docs/POLITICA_DE_PRIVACIDAD_LOCAL.md) | Qué datos toca y cómo comprobarlo |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Qué falta y en qué orden |

---

## ⚠️ Limitaciones honestas

- Un inventario **no demuestra** que un contrato esté libre de vulnerabilidades.
- Un RPC puede mentir o estar comprometido; los eventos críticos requieren una
  segunda fuente independiente.
- Una pausa o rotación solo ayuda si la arquitectura on-chain la permite y las
  claves de respuesta siguen seguras.
- La aplicación **no reemplaza** auditorías, verificación formal, simulación,
  monitoreo económico ni respuesta profesional a incidentes.
- Los umbrales incluidos son ejemplos y deben adaptarse al riesgo del sistema.
- El watchtower solo vigila mientras el panel está abierto. Para vigilancia
  continua, el camino soportado es el despliegue self-hosted con `compose.yaml`.
- Los binarios no están firmados con certificado de código: SmartScreen puede
  advertir en la primera ejecución. La verificación disponible hoy es el hash
  publicado.
- El puntaje de riesgo mide **exposición a señales investigables** sobre los
  datos ingeridos. No es una prueba, no atribuye identidad y **la ausencia de
  indicadores no demuestra ausencia de riesgo**.
- La inteligencia solo ve lo que se le ingirió. No sigue fondos al otro lado de
  un puente, no observa el mempool y no consulta reputación externa.
- Los umbrales de los indicadores son ejemplos calibrables: mal ajustados
  producen falsos positivos, no seguridad.

---

## 🧩 La familia RootCause

~~~text
RootCause
├── Inspectors ─────── ¿este dispositivo se está comportando raro?
│   ├── rootcause-windows-inspector      Rust + egui
│   ├── rootcause-macos-inspector        Rust + egui
│   ├── rootcause-web-inspector          Extensión MV3 + Node
│   └── rootcause-mobile-inspector       Flutter
└── Digital Assets ─── ¿este sistema de valor está bien controlado?
    ├── rootcause-bitcoin-defense        UTXO, firmantes, PSBT
    └── rootcause-blockchain-security    contratos, puentes, oráculos  ← estás aquí
~~~

Detalle en [`docs/FAMILIA_ROOTCAUSE.md`](docs/FAMILIA_ROOTCAUSE.md).

## Licencia

MIT. Revisa [`SECURITY.md`](SECURITY.md) y
[`docs/SECURITY-CHECKLIST.md`](docs/SECURITY-CHECKLIST.md) antes de usar datos
reales.
