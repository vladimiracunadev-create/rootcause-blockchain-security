# RootCause Blockchain Security

Aplicación de escritorio local y watch-only para inventariar aplicaciones
blockchain, detectar fallas de control, correlacionar eventos on-chain y
producir incidentes causales sin custodiar claves ni ejecutar transacciones.

Es el producto hermano de `rootcause-bitcoin-defense`: comparte el núcleo
RootCause, pero mantiene separado el dominio de contratos inteligentes, puentes,
oráculos, gobernanza, validadores y cadena de suministro. La diferencia entre
ambos —y entre «blockchain» y «Bitcoin»— está explicada en
[docs/BLOCKCHAIN-Y-BITCOIN.md](docs/BLOCKCHAIN-Y-BITCOIN.md).

## Qué protege

- procedencia de contratos y bytecode;
- privilegios de admin, proxies y upgrades;
- timelocks y concentración de gobernanza;
- frescura y diversidad de oráculos;
- quorums y operadores de puentes;
- dependencias fijadas y verificadas;
- cambios privilegiados fuera de política;
- salidas de valor anómalas;
- integridad, red correcta y atraso del observador RPC;
- evidencia, runbooks y auditoría encadenada.

La versión inicial trae un adaptador EVM de solo lectura. Solana, Cosmos,
Substrate y otras redes pueden enviar hechos normalizados a la misma API sin
acoplar el motor de reglas a un SDK concreto.

## Principios no negociables

1. Nunca solicita ni almacena frases semilla, claves privadas, keystores,
   credenciales RPC, firmas pendientes o transacciones sin publicar.
2. No firma, construye ni transmite transacciones.
3. JSON-RPC usa una allowlist estricta de métodos de lectura.
4. RPC acepta localhost por defecto; destinos remotos requieren habilitación
   explícita y controles de red externos.
5. Las reglas son deterministas. La IA es opcional y no tiene autoridad.
6. Toda acción privilegiada exige un runbook y aprobación humana separada.

Estos seis puntos no son una declaración de intenciones: `scripts/check-security-claims.js`
los comprueba arrancando la aplicación real y golpeándola con peticiones
hostiles, y CI no deja pasar un cambio que los incumpla.

## Aplicación de Windows

La forma principal de distribución es una aplicación de escritorio. Cada release
publica dos artefactos con el mismo contenido:

| Formato | Archivo | Cuándo usarlo |
| --- | --- | --- |
| Instalador | `RootCause-Blockchain-Security-<versión>-win-x64-setup.exe` | Uso normal. Instala por usuario, sin permisos de administrador. |
| Portable | `RootCause-Blockchain-Security-<versión>-win-x64-portable.zip` | Descomprimir y ejecutar, sin instalar nada. |

Ninguno requiere Node.js instalado: el motor oficial viaja dentro, verificado
por SHA-256 contra `SHASUMS256.txt` de nodejs.org al empaquetar. Detalles de
construcción, configuración y verificación en
[docs/WINDOWS-APP.md](docs/WINDOWS-APP.md).

Para construir los artefactos en local:

~~~bash
pnpm package:windows
~~~

¿Por qué escritorio y no una web alojada, y por qué Node y no Rust o Go? Está
razonado, con disparadores explícitos de migración, en
[docs/ADR-0001-plataforma-y-lenguaje.md](docs/ADR-0001-plataforma-y-lenguaje.md).

## Inicio rápido (desarrollo)

Requisitos: Node.js 22.12 o superior y pnpm 11. No hay dependencias externas.

~~~bash
corepack enable
pnpm start
~~~

Abre http://127.0.0.1:8790. El modo demo usa datos ficticios y memoria.

## Verificación

~~~bash
pnpm check
~~~

Encadena las cinco puertas que también corren en CI:

| Puerta | Qué comprueba |
| --- | --- |
| `pnpm lint` | Estructura del repositorio, JSON válido, sintaxis y ausencia de material privado embebido |
| `pnpm test` | Pruebas unitarias y de integración |
| `pnpm check:local-only` | Cero dependencias, cero orígenes remotos, cero proveedores RPC alojados, CSP self-only |
| `pnpm check:security` | Arranca la aplicación y verifica los seis principios contra peticiones hostiles |
| `pnpm check:rules` | El motor, el catálogo de controles, la política y el README describen el mismo conjunto de reglas |
| `pnpm check:docs` | Ningún documento enlaza a un archivo inexistente |

Si Corepack no puede consultar la red, ejecuta los equivalentes sin descarga:

~~~bash
node scripts/validate-repo.js
node --test
~~~

## Persistencia cifrada

~~~bash
pnpm generate:data-key

DEMO_MODE=false \
ROOTCAUSE_DATA_KEY="valor-generado" \
pnpm start
~~~

El estado se cifra con AES-256-GCM y la auditoría se encadena con SHA-256. La
clave de cifrado nunca se escribe en el repositorio.

## Observador EVM

Por defecto se conecta únicamente a `127.0.0.1:8545` y usa:

- `eth_chainId`;
- `eth_blockNumber`;
- `eth_getBlockByNumber`;
- `eth_getCode`;
- `eth_getStorageAt`;
- `eth_call`;
- `eth_getLogs`;
- `net_version`;
- `web3_clientVersion`.

Ejemplo:

~~~bash
DEMO_MODE=false \
ROOTCAUSE_DATA_KEY="valor-generado" \
EVM_RPC_URL="http://127.0.0.1:8545" \
EVM_EXPECTED_CHAIN_ID=1 \
WATCHTOWER_ENABLED=true \
pnpm start
~~~

La allowlist es defensa en profundidad; no sustituye aislamiento, autenticación
RPC ni verificación independiente del proveedor. Un endpoint remoto exige
además `EVM_ALLOW_REMOTE_RPC=true`, y conviene saber lo que implica: el
proveedor al que consultes ve qué contratos estás vigilando.

## Reglas incluidas

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

Los controles están definidos en `config/control-catalog.json` y los umbrales en
`config/policies.json`.

## API mínima

~~~bash
curl http://127.0.0.1:8790/api/summary

curl -X POST http://127.0.0.1:8790/api/scan \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data "{}"
~~~

Consulta [docs/API.md](docs/API.md) para todas las rutas.

## Estructura

~~~text
config/                  Políticas y catálogo de controles
docs/                    Arquitectura, amenazas, decisiones, integración y runbooks
examples/                Proyectos y eventos públicos ficticios
packaging/windows/       Empaquetado de escritorio: portable, instalador e icono
scripts/                 Validación, gates de seguridad y utilidades
src/api/                 API HTTP local
src/domain/              Validación, reglas y protección de secretos
src/infrastructure/      RPC EVM, cifrado y auditoría
src/services/            Casos de uso y watchtower
src/web/static/          Dashboard responsive y PWA
test/                    Pruebas unitarias e integración
~~~

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/ADR-0001-plataforma-y-lenguaje.md](docs/ADR-0001-plataforma-y-lenguaje.md) | Por qué escritorio y no SaaS; por qué Node hoy y Rust después; por qué no Go |
| [docs/BLOCKCHAIN-Y-BITCOIN.md](docs/BLOCKCHAIN-Y-BITCOIN.md) | Qué es cada cosa y por qué son dos productos |
| [docs/WINDOWS-APP.md](docs/WINDOWS-APP.md) | Construir, configurar, verificar y publicar la aplicación |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Capas, flujo de datos y decisiones internas |
| [docs/API.md](docs/API.md) | Contrato HTTP completo |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | Amenazas consideradas y fuera de alcance |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Respuesta operativa a incidentes |
| [docs/SECURITY-CHECKLIST.md](docs/SECURITY-CHECKLIST.md) | Antes de usar datos reales |
| [docs/INTEGRATION-ROOTCAUSE.md](docs/INTEGRATION-ROOTCAUSE.md) | Encaje con el resto de la familia RootCause |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Qué falta y en qué orden |

## Limitaciones honestas

- Un inventario no demuestra que un contrato esté libre de vulnerabilidades.
- Un RPC puede mentir o estar comprometido; los eventos críticos requieren una
  segunda fuente independiente.
- Una pausa o rotación solo ayuda si la arquitectura on-chain la permite y las
  claves de respuesta siguen seguras.
- La aplicación no reemplaza auditorías, verificación formal, simulación,
  monitoreo económico ni respuesta profesional a incidentes.
- Los umbrales incluidos son ejemplos y deben adaptarse al riesgo del sistema.
- El watchtower solo vigila mientras el panel está abierto. Para vigilancia
  continua, el camino soportado es el despliegue self-hosted con `compose.yaml`.

## Relación con Bitcoin

Bitcoin es una red y activo concretos; blockchain es la categoría tecnológica.
Por eso existen dos productos separados:

~~~text
RootCause Digital Assets
├── rootcause-bitcoin-defense
└── rootcause-blockchain-security
~~~

El primero entiende UTXO, Bitcoin Core, wallets y PSBT. Este repositorio entiende
aplicaciones programables y dependencias multi-chain.

## Licencia

MIT. Revisa `SECURITY.md` y [docs/SECURITY-CHECKLIST.md](docs/SECURITY-CHECKLIST.md)
antes de usar datos reales.
