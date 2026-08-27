# 16 · Glosario

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

Términos que aparecen en el código, en la interfaz y en el resto de esta
documentación. Las definiciones están escritas para que las entienda alguien sin
formación técnica; cuando el término tiene un significado **específico dentro de
este sistema**, se indica.

---

## Conceptos de blockchain

**Blockchain (cadena de bloques)**
Un registro compartido de operaciones que muchas máquinas mantienen a la vez.
Cada bloque de operaciones apunta al anterior, lo que hace muy difícil cambiar
el pasado sin que se note. En las cadenas públicas, cualquiera puede leerlo.

**Bloque**
Un lote de transacciones confirmadas a la vez. Tiene una altura (su número de
orden) y un hash (su huella).

**Transacción**
Una operación registrada en la cadena. Tiene un identificador único —el `txid` o
hash— que sirve como prueba de que ocurrió y permite verificarla en cualquier
otra fuente.

**Dirección**
La referencia pública a la que se envía o desde la que se envía valor. **No es
una persona.** Este sistema trata la dirección exclusivamente como un
identificador público y se niega estructuralmente a convertirla en una identidad.

**EOA** (*Externally Owned Account*, cuenta de propiedad externa)
Una cuenta controlada por **una sola clave privada**. Si esa clave se
compromete, se pierde todo lo que controla. Que una EOA sea administradora de un
contrato importante es una de las condiciones que este sistema marca como
crítica (`BLK-ACCESS-001`).

**Contrato inteligente**
Un programa que vive en la cadena y se ejecuta cuando alguien lo invoca. Puede
custodiar fondos.

**Multisig** (firma múltiple)
Una cuenta que exige **varias aprobaciones** para actuar: por ejemplo, tres de
cinco propietarios. Reduce el daño de que una sola clave se comprometa —siempre
que los firmantes sean realmente independientes.

**Umbral** (*threshold*)
Cuántas aprobaciones hacen falta. Un multisig con umbral 1 no protege de nada:
el sistema lo marca con `BLK-ACCESS-002`.

**Smart account** (cuenta inteligente)
Una cuenta que es un contrato: puede tener varios propietarios, guardianes,
módulos y reglas de recuperación. Más flexible que una EOA, y por eso con más
piezas que pueden cambiar sin que nadie lo advierta (`BLK-WALLET-006`).

**Allowance** (autorización de gasto)
Un permiso que una cuenta concede a un contrato para gastar una cantidad de un
token **en su nombre**. Es cómodo y peligroso: si no se retira, sigue vivo. Un
allowance **ilimitado** —el valor máximo posible— significa que el contrato puede
vaciar el saldo de ese token en cualquier momento (`BLK-WALLET-001`).

**Revocar**
Retirar un allowance, poniéndolo a cero. **RootCause detecta allowances fuera de
política pero nunca revoca**: no tiene la capacidad de firmar la operación.

**Permit** (EIP-2612, EIP-712, Permit2)
Una autorización de gasto que se concede con una **firma fuera de la cadena** en
lugar de con una transacción. Equivale a un allowance, pero deja menos rastro
antes de usarse. Cuando se consume, sí aparece on-chain (`BLK-WALLET-004`).

**Operador NFT**
Un permiso que autoriza a un tercero a mover objetos digitales (NFT) de una
colección. En su forma «global» autoriza **toda** la colección
(`BLK-WALLET-003`).

**EIP-7702 / delegación**
Un mecanismo que permite a una cuenta simple (EOA) delegar su ejecución en el
código de un contrato. Cambia **qué código actúa en nombre de la cuenta**, así
que un cambio inesperado es grave (`BLK-WALLET-007`).

**Oráculo**
Un servicio que introduce datos del mundo exterior en la cadena, típicamente
precios. Si se concentra en pocas fuentes (`BLK-ORACLE-001`) o deja de
actualizarse (`BLK-ORACLE-002`), las aplicaciones que dependen de él operan con
datos falsos.

**Heartbeat**
La frecuencia con la que un oráculo promete actualizarse. Si pasa más del doble
de ese tiempo sin actualizar, este sistema lo considera vencido.

**Puente** (*bridge*)
Un mecanismo para mover valor entre dos cadenas distintas. Históricamente, uno de
los puntos donde más dinero se ha perdido, porque su seguridad depende de un
conjunto de validadores (`BLK-BRIDGE-001`).

**Timelock**
Un retardo obligatorio entre anunciar un cambio y ejecutarlo. Es lo que da
tiempo a detectarlo y reaccionar (`BLK-UPGRADE-001`, `BLK-GOV-001`).

**Upgrade / proxy**
La capacidad de sustituir el código de un contrato manteniendo su dirección y sus
fondos. Muy útil, y muy peligrosa sin timelock.

**Gobernanza**
El mecanismo por el que se toman decisiones sobre un protocolo: votación de
poseedores de un token, un consejo, un multisig.

**Chain ID**
El número que identifica una red concreta. Si el observador está conectado a un
chain ID distinto del esperado, **todo lo que informa es sobre otra red**
(`BLK-NODE-002`, severidad crítica).

**RPC** (*Remote Procedure Call*)
El protocolo por el que un programa consulta un nodo de la cadena. En este
sistema, **solo de lectura** y **por defecto solo hacia un nodo local**.

**Mempool**
La sala de espera de las transacciones antes de confirmarse. **Este sistema no
la observa**: solo ve lo ya confirmado.

**Reorganización** (*reorg*)
Cuando la cadena descarta bloques que ya había confirmado y los sustituye por
otros. Este sistema lo detecta, marca lo descartado como **huérfano** y lo
conserva como evidencia en lugar de borrarlo.

**Huérfano** (*orphaned*)
Un bloque o una transacción que quedó fuera de la cadena tras una
reorganización. Se conserva —fue observado— pero **se excluye del análisis**,
porque describe una historia que la cadena ya descartó.

**UTXO frente a cuentas**
Dos formas de representar el valor. Bitcoin usa UTXO: cada transacción consume
salidas anteriores y crea nuevas. Ethereum usa cuentas: hay saldos y se
transfiere entre ellos. Este sistema normaliza ambos a un modelo común de
«transferencias».

**Wei, satoshi, unidad mínima**
La unidad más pequeña de un activo (1 ETH = 10¹⁸ wei; 1 BTC = 10⁸ satoshis).
Este sistema **siempre** trabaja en unidades mínimas y con enteros: un redondeo
en un análisis forense es un dato falso.

**Address poisoning** (envenenamiento de historial)
Un ataque en el que alguien envía una transferencia irrelevante desde una
dirección **visualmente parecida** a una que la víctima usa, para que aparezca en
su historial. Si más tarde alguien copia la dirección de ahí, los fondos van al
atacante (`BLK-WALLET-005`, `INT-EXPO-002`).

**Drainer**
Un contrato o dirección cuyo propósito es vaciar cuentas que interactúan con él.
En este sistema, los drainers están en un **registro local** del operador, nunca
en una lista externa.

**Peeling chain**
Una cadena de transacciones en la que cada paso desprende un importe pequeño y
traslada el resto a una dirección nueva. Se asocia a alejar fondos de su origen
—y también a la gestión normal de cambio en carteras Bitcoin, que es por qué el
sistema lo trata como indicador y no como conclusión (`INT-FLOW-004`).

**Fan-in / fan-out**
Muchas direcciones enviando a una (consolidación) o una enviando a muchas
(dispersión). Ambos patrones pueden ser un exchange operando con normalidad
(`INT-FLOW-001`, `INT-FLOW-002`).

---

## Términos propios de este sistema

**Watch-only** (solo observación)
La propiedad central del producto: **observa sin poder actuar**. No custodia
claves, no firma, no envía transacciones, no revoca permisos. No es una
restricción de configuración: es la ausencia de la capacidad en el código, y hay
gates ejecutables que impiden introducirla.

**Causa raíz** (*root cause*)
La explicación de **por qué** una condición es un problema, no solo la
descripción de que existe. Cada incidente lleva la suya, y es lo que da nombre al
producto.

**Hallazgo** (*finding*)
Lo que produce el motor de reglas en una ejecución: una condición detectada, con
su severidad, evidencia y remediación. Es instantáneo.

**Incidente**
Un hallazgo **con historia**: cuándo se detectó por primera vez, cuándo se vio
por última vez, si alguien lo reconoció y si se resolvió. Un hallazgo que
reaparece conserva su incidente; uno que desaparece se resuelve solo.

**Indicador** (`INT-*`)
Una señal reproducible sobre hechos observados. **No es una violación de política
ni una acusación:** dice «este patrón aparece en estos datos, con esta confianza,
y así es como podría ser un falso positivo». La decisión es de una persona.

**Control** (`SC-*`, `ADMIN-*`, `WALLET-*`, …)
Una agrupación de reglas por objetivo de seguridad. Hay 13, y cada una de las 22
reglas pertenece exactamente a uno.

**Regla** (`BLK-*`)
Una condición determinista que, al cumplirse, produce un hallazgo. Hay 22.

**Alerta**
Lo que produce un indicador al ejecutarse el análisis. Tiene estado
(`new`, `in-review`, `confirmed`, `false-positive`, `mitigated`, `closed`),
responsable e historial. **A diferencia de un incidente, no se cierra sola:**
describe un hecho pasado, y que los datos ya no lo muestren no significa que no
ocurriera.

**Caso** (de investigación)
El expediente donde un analista agrupa alertas, notas, decisiones y evidencia
sobre un asunto concreto.

**Evidencia**
Un objeto que se sella con su huella SHA-256 al crearse y **no se puede
modificar**: el sistema solo ofrece añadir y verificar.

**Nivel epistémico**
La clasificación de **cuánto respalda un dato lo que afirma**. Los cinco niveles:

| Nivel | Significado |
|---|---|
| `observed-fact` | Lo dijo la cadena y conservamos su procedencia |
| `indicator` | Una regla determinista se activó sobre hechos |
| `inference` | Derivamos algo combinando hechos |
| `hypothesis` | Agrupación o atribución no confirmada |
| `verified-identity` | **Este sistema NUNCA lo produce.** Existe en la lista precisamente para declararlo |

**Procedencia** (*provenance*)
De dónde viene un dato y con qué fiabilidad. Todo hecho observado la lleva, y la
fiabilidad **se propaga hasta el puntaje final**: una señal fuerte sobre un dato
dudoso no es una señal fuerte.

**Fiabilidad de la fuente**
Un número entre 0 y 1 asignado por tipo de fuente: nodo propio 1,0; dataset local
0,9; indexador 0,75; explorador 0,6; inteligencia de terceros 0,5; desconocida
0,3.

**Confianza** (*confidence*)
Cuánto respalda la evidencia a un indicador o a un análisis: `low`, `medium` o
`high`. **Es independiente del puntaje**: se puede tener un puntaje alto con
confianza baja, y el sistema lo dice.

**Puntaje de riesgo**
Un número de 0 a 100 que mide **exposición a señales investigables**, no
culpabilidad. **Nunca viaja solo**: siempre lleva sus factores, su confianza, sus
limitaciones y la declaración de que requiere revisión humana.

**Banda**
La etiqueta del puntaje: bajo (0-24), moderado (25-49), alto (50-74), crítico
(75-100).

**Factor**
Cada componente del puntaje, con nombre, puntos, peso y explicación. Los hay que
suman (indicadores, proximidad) y que restan (fuente poco fiable, contraparte
conocida, historial largo, aprobación revocada).

**Proximidad en el grafo**
A cuántos saltos está una dirección de otra marcada localmente. **Estar cerca no
implica participación**: una dirección puede recibir fondos sin conocer su
origen, y el sistema lo advierte en el propio resultado.

**Truncado** (*truncated*)
Cuando una consulta alcanza una cota y no vio todo lo que había. El resultado lo
declara, con el motivo (`max-nodes`, `max-edges`, `max-depth`). Un resultado
truncado presentado como completo llevaría a concluir que unos fondos no llegaron
a ninguna parte cuando en realidad la búsqueda se detuvo.

**Comunidad**
Un grupo de direcciones conectadas entre sí por transferencias observadas. **No
implica que sean del mismo dueño.**

**Cluster de wallets**
Una agrupación heurística de direcciones. Siempre `hypothesis`, nunca identidad.

**Watchtower**
El proceso opcional que, cada cierto tiempo, refresca el observador y vuelve a
analizar.

**Observador**
El nodo RPC desde el que el sistema obtiene hechos de la cadena. Si cae, apunta a
otra red o se atrasa, **eso también es un incidente**.

**Colector**
Un proceso externo que envía eventos on-chain normalizados a la aplicación.

**Conector**
El adaptador que trae datos de una fuente. Todos son de solo lectura, declaran
sus capacidades y publican sus métricas.

**Modo demostración**
`DEMO_MODE=true`: el estado vive en memoria con datos de ejemplo y **se pierde al
cerrar**.

**Modo persistente**
`DEMO_MODE=false`: el estado se guarda cifrado en disco y **exige la clave de
datos**.

**Clave de datos** (`ROOTCAUSE_DATA_KEY`)
Los 32 bytes con los que se cifra el estado. **Si se pierde, el estado es
irrecuperable.**

**Cadena de auditoría**
El registro de todo lo que ocurrió, donde cada entrada guarda la huella de la
anterior. Alterar una entrada intermedia invalida esa y todas las siguientes.

**Actor**
La etiqueta que identifica quién realizó una acción en la auditoría.
**No es una credencial**: es lo que alguien dijo ser.

**Gate** (puerta)
Un script que comprueba de forma ejecutable una afirmación del proyecto. Si la
afirmación deja de ser cierta, el build falla.

**Cero dependencias**
Que el proyecto no usa ninguna librería de terceros. Es una propiedad verificada
por un gate, no una aspiración.

**Solo local**
Que todo ocurre en la máquina del operador, sin servicios remotos.

---

## Estados

| Entidad | Estados |
|---|---|
| **Incidente** | `open` · `acknowledged` · `resolved` |
| **Alerta** | `new` · `in-review` · `confirmed` · `false-positive` · `mitigated` · `closed` |
| **Caso** | `open` · `in-review` · `closed` |
| **Proyecto** | `active` · `paused` · `migration-required` · `retired` |
| **Bloque / transacción** | normal · `orphaned` |

## Severidades

| Nivel | Peso en el puntaje de postura | Significado |
|---|---|---|
| `critical` | 100 | Requiere contención y verificación inmediata |
| `high` | 75 | Puede producir impacto significativo |
| `medium` | 45 | Brecha que corregir antes de ampliar exposición |
| `low` | 20 | Señal acotada; conservar vigilancia |
| `info` | 5 | Informativo |

## Siglas

| Sigla | Significado |
|---|---|
| **ADR** | *Architecture Decision Record*, registro de una decisión de arquitectura |
| **AES-256-GCM** | Cifrado autenticado con clave de 256 bits |
| **API** | Interfaz de programación |
| **BIP-32 / BIP-39** | Estándares de Bitcoin para claves derivadas y frases semilla |
| **CI/CD** | Integración y entrega continuas |
| **CSP** | *Content-Security-Policy*, política de seguridad del navegador |
| **CSRF** | Falsificación de petición entre sitios |
| **EIP** | *Ethereum Improvement Proposal* |
| **EOA** | Cuenta de propiedad externa |
| **ESM** | Módulos de JavaScript estándar |
| **EVM** | *Ethereum Virtual Machine* |
| **GCM** | Modo de cifrado con autenticación |
| **JSON-RPC** | Protocolo de llamada a procedimiento sobre JSON |
| **LTS** | Soporte a largo plazo |
| **NFT** | Objeto digital único (*non-fungible token*) |
| **PWA** | Aplicación web instalable |
| **SHA-256** | Función de huella criptográfica |
| **UTXO** | *Unspent Transaction Output* |
| **UUID** | Identificador único universal |
| **WIF** | Formato de clave privada de Bitcoin |
| **XSS** | Inyección de código en el navegador |

## Términos del negocio

**Postura de seguridad**
El estado agregado: cuánto riesgo hay ahora mismo y de qué tipo.

**Superficie de ataque**
El conjunto de puntos por los que alguien podría intentar entrar. Este sistema
está diseñado para tener una muy pequeña, y para inventariarla.

**Runbook**
El procedimiento escrito de qué hacer cuando ocurre algo concreto.

**Falso positivo**
Una señal que resultó no ser un problema. Este sistema lo trata como
**información valiosa**: se registra con su motivo para poder medir la calidad
del motor.

**Falso negativo**
Un problema real que el sistema no detectó. Este sistema prefiere un falso
negativo silencioso a un hallazgo construido sobre un dato que no entiende.

**Triaje**
Revisar y clasificar lo detectado para decidir a qué se atiende primero.

**Contención**
Las acciones para limitar el daño de un incidente en curso. **RootCause no las
ejecuta**: las describe.

**Diagnóstico primero, intervención después**
El lema del producto. Explica por qué es watch-only: primero entender qué pasa y
por qué; actuar es una decisión humana, con sus propias herramientas.

---

## Documentos relacionados

- [01 · Descripción general del sistema](01-system-overview.md)
- [05 · Referencia técnica](05-technical-reference.md)
- [`../BLOCKCHAIN-Y-BITCOIN.md`](../BLOCKCHAIN-Y-BITCOIN.md) — qué es cada cosa, en claro
- [`../MANUAL_USUARIO.md`](../MANUAL_USUARIO.md)
<!-- navegacion -->
---

**[← 15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md)** · **[Índice](README.md)** · **[17 · Resumen ejecutivo →](17-executive-summary.md)**
