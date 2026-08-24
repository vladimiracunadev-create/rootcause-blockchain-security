# Blockchain y Bitcoin: qué son y por qué son dos productos

Este documento existe porque la confusión entre ambos términos no es un detalle
de vocabulario: lleva a defender lo que no toca, con las herramientas
equivocadas.

## 1. La distinción en una frase

**Bitcoin es una red y un activo concretos. Blockchain es la categoría técnica a
la que Bitcoin pertenece.**

La relación es la misma que entre «WhatsApp» y «aplicación de mensajería», o
entre «Linux» y «sistema operativo». Todo Bitcoin es blockchain; casi nada de lo
que hoy se llama blockchain es Bitcoin.

Dicho de otra forma: *blockchain* nombra una estructura de datos —bloques
encadenados por hash, replicados entre participantes que no confían entre sí y
ordenados por un mecanismo de consenso— y Bitcoin es la primera implementación
de esa estructura que resolvió el problema real que tenía delante: transferir
valor sin un intermediario que lleve el libro mayor.

## 2. Un error de nivel: blockchain no es lo importante de Bitcoin

Conviene invertir la explicación habitual. La cadena de bloques es solo el
registro. Lo que hace funcionar a Bitcoin es el **consenso de Nakamoto**: un
mecanismo que hace costoso reescribir la historia y que consigue que miles de
nodos sin relación previa converjan en el mismo estado sin ponerse de acuerdo
por adelantado.

Por eso «usar blockchain» no aporta seguridad por sí mismo. Una cadena de
bloques sin descentralización real, sin coste de reescritura y sin nodos
independientes que verifiquen es una base de datos con pasos extra. La palabra
no protege nada; el mecanismo de consenso y quién lo ejecuta, sí.

## 3. Qué cambia en la práctica

| | Bitcoin | Blockchain programable (Ethereum, Solana, Cosmos…) |
| --- | --- | --- |
| **Modelo de estado** | UTXO: monedas discretas que se gastan enteras | Cuentas y almacenamiento persistente por contrato |
| **Programabilidad** | Deliberadamente limitada (Script, sin bucles) | Turing-completa: el código es el que mueve el valor |
| **Superficie de ataque dominante** | Custodia: semillas, firmantes, procedencia del firmware, multisig | Aplicación: privilegios de admin, upgrades, oráculos, puentes, dependencias |
| **Quién puede perderlo todo** | Quien controla las claves | Quien controla las claves **y además** cualquiera que pueda actualizar el contrato, mover el oráculo o alcanzar quorum en el puente |
| **Reversibilidad** | Ninguna | Ninguna, pero a veces existe pausa, timelock o upgrade de emergencia |
| **Unidad de riesgo** | Una wallet | Un sistema de contratos con sus dependencias |

La consecuencia operativa es la que importa: en Bitcoin, si tus claves están
bien custodiadas, tus fondos están razonablemente a salvo. En una cadena
programable, tus claves pueden estar perfectas y aun así perderlo todo porque
una EOA olvidada seguía siendo `owner` de un proxy, porque un oráculo se quedó
sin actualizar, o porque un puente con quorum 2-de-3 tenía los tres firmantes en
la misma nube.

## 4. Por qué esto justifica dos repositorios y no uno

~~~text
RootCause Digital Assets
├── rootcause-bitcoin-defense        procedencia de claves, firmantes, UTXO, PSBT
└── rootcause-blockchain-security    contratos, proxies, oráculos, puentes, gobernanza
~~~

Un solo producto que intentara cubrir ambos dominios acabaría con un modelo de
datos que no describe bien ninguno: una `wallet` con `signers` y una `dApp` con
`contracts`, `oracles` y `bridges` no comparten casi nada más que el nombre de
la carpeta.

Lo que **sí** comparten es el núcleo RootCause, y por eso el código se parece
tanto entre ambos repositorios:

- inventario primero, detección después: no se puede defender lo que no está
  listado;
- reglas deterministas con causa raíz, evidencia y runbook, no puntuaciones
  opacas;
- postura watch-only: nunca claves, nunca firma, nunca transmisión;
- auditoría encadenada por hash y persistencia cifrada;
- todo local, sin dependencias y sin servidor de terceros.

Esa separación también es la razón de que este repositorio **no** hable de
semillas ni de PSBT, y de que el hermano **no** tenga reglas de oráculos: cada
uno rechaza el vocabulario del otro a propósito.

## 5. Qué cubre concretamente este repositorio

Veintidós detecciones deterministas, agrupadas en trece controles
(`config/control-catalog.json`), sobre las cinco superficies donde una
aplicación blockchain pierde dinero sin que nadie robe una clave:

1. **Procedencia del código**: bytecode desplegado sin fuente verificable.
2. **Privilegios**: admin en una EOA, multisig con umbral débil, upgrade sin
   demora mínima.
3. **Entradas de datos**: oráculo concentrado sin fallback, feed vencido
   respecto de su heartbeat.
4. **Puentes y gobernanza**: quorum insuficiente, operadores no independientes,
   timelock por debajo de política.
5. **Cadena de suministro y operación**: dependencias sin fijar, cambios
   privilegiados sin aprobación registrada, salidas de valor anómalas, y la
   integridad del propio observador (disponible, en la red correcta, al día).

La lista completa con sus códigos `BLK-*` está en el README, y un gate de CI
(`scripts/check-rule-coverage.js`) impide que el motor, el catálogo, la política
y la documentación se desincronicen.

## 6. Multi-chain sin acoplarse a ninguna cadena

El motor de reglas no importa ningún SDK. Trabaja sobre hechos ya normalizados:

- para EVM hay un observador JSON-RPC de solo lectura incluido;
- para Solana, Cosmos, Substrate o cualquier otra red, un adaptador externo
  envía hechos normalizados a `POST /api/observe/event`.

Esa frontera es deliberada. Es lo que permite que añadir una cadena no obligue a
tocar el motor causal, y lo que mantiene el repositorio con cero dependencias
—el punto donde más presión recibiría en un proyecto multi-chain.

## 7. Lo que ninguno de los dos productos puede hacer

- Un inventario no demuestra que un contrato esté libre de vulnerabilidades.
- Un RPC puede mentir o estar comprometido: los eventos críticos necesitan una
  segunda fuente independiente.
- Una pausa o una rotación solo ayudan si la arquitectura on-chain las permite y
  las claves de respuesta siguen seguras.
- Nada de esto sustituye auditorías, verificación formal, simulación, monitoreo
  económico ni respuesta profesional a incidentes.

Ver también [THREAT_MODEL.md](THREAT_MODEL.md) y
[SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md).
