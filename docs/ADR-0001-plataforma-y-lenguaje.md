# ADR-0001 — Plataforma de distribución y lenguaje de implementación

- Estado: aceptado
- Fecha: 20 de agosto de 2026
- Decide: aplicación de escritorio para Windows como forma principal de
  distribución, con despliegue self-hosted soportado, escrita hoy en Node.js y
  con criterios explícitos y verificables para migrar a Rust más adelante.

Este documento existe porque las dos preguntas —«¿dónde debe vivir esto?» y
«¿en qué lenguaje?»— tienen respuestas distintas y conviene no mezclarlas.

Hay un ADR equivalente en `rootcause-bitcoin-defense`. Las conclusiones se
parecen, pero **no son las mismas**, y las diferencias están señaladas a
propósito: este dominio es multi-chain, sus nodos no siempre son locales y su
ecosistema de lenguajes no se reparte igual.

## 1. Contexto

RootCause Blockchain Security no es una wallet ni un explorador. No custodia
claves, no firma y no transmite transacciones. Es una **consola de operador**:
inventaría contratos, proxies, oráculos, puentes, gobernanza y dependencias,
evalúa sus controles contra políticas versionadas, correlaciona hechos on-chain
y produce incidentes con causa raíz, evidencia y runbook.

Eso condiciona la plataforma más que ninguna preferencia estética:

1. el inventario que guarda —qué contratos operas, quién es admin de cada uno,
   qué puentes dependen de qué firmantes, qué incidentes tienes abiertos— es
   material sensible: es literalmente el mapa de por dónde atacar el sistema;
2. necesita persistir estado cifrado en el disco del operador;
3. no debe depender de ningún servidor de terceros, ni siquiera del autor;
4. su usuario es alguien sentado frente a un equipo, respondiendo un incidente
   con tres pestañas y un runbook abiertos.

## 2. Decisión de plataforma

### 2.1 Escritorio (Windows): sí, y es la principal

Las cuatro condiciones anteriores describen una aplicación de escritorio.
Windows primero por dos razones: es donde está el operador al que apunta este
trabajo, y es donde ya vive **RootCause Windows Inspector**, con el que este
módulo comparte destino. El mismo código corre en Linux y macOS sin cambios —el
empaquetado de escritorio es lo único específico de Windows.

La aplicación se publica como instalador por usuario (sin permisos de
administrador) y como edición portable. Ver [WINDOWS-APP.md](WINDOWS-APP.md).

### 2.2 Web: distinguir tres cosas que suelen confundirse

Aquí este producto se separa de su hermano Bitcoin, y conviene ser preciso
porque «web» significa tres cosas distintas:

**a) Web como capa de interfaz: sí, y es lo que hace.** El panel es HTML, CSS y
JavaScript sin dependencias, servido por el propio proceso local, con CSP
`self` y sin un solo origen externo. Un gate de CI
(`scripts/check-local-only.js`) tumba el build si alguien mete un CDN, una
fuente remota o un SDK.

**b) Self-hosting en la infraestructura del propio operador: sí, soportado.**
Hay `Dockerfile` y `compose.yaml`. Un equipo que quiera correr esto en su
propia red, detrás de su propia autenticación, está haciendo algo legítimo: los
datos siguen siendo suyos. Es la vía natural cuando el watchtower debe correr
de forma continua y no solo mientras alguien tiene el panel abierto.

**c) SaaS multi-tenant alojado por el autor: no, y queda descartado por
escrito.** Ese servidor concentraría el inventario de control de varias
organizaciones: qué contratos son actualizables por una sola EOA, qué puentes
tienen quorum débil, qué timelocks son insuficientes. Sería un objetivo de
altísimo valor y un punto único de fallo. Hoy ese servidor no existe, y esa
ausencia es una propiedad de seguridad, no una carencia.

Nota honesta sobre el RPC: en Bitcoin el argumento «un navegador no puede
leer `127.0.0.1:8332`» cierra la discusión. Aquí es más débil, porque el
ecosistema EVM normalizó los proveedores RPC alojados. Por eso la postura por
defecto es explícita: `EVM_RPC_URL` apunta a `127.0.0.1:8545` y un destino
remoto exige `EVM_ALLOW_REMOTE_RPC=true`. Usar un proveedor alojado no está
prohibido, pero es una decisión consciente con una consecuencia concreta: ese
proveedor ve qué consultas haces, y eso filtra qué estás vigilando.

### 2.3 Móvil: matiz

La intuición de partida —«el bitcoin no se gestiona en móvil»— es medio cierta.
Sí existen wallets móviles serias y mucha gente las usa a diario. Lo que no
encaja en un teléfono es *este* producto: un inventario de controles con
runbooks de contención es trabajo de escritorio, con varias fuentes delante y
capacidad de pegar direcciones y hashes.

El papel razonable del móvil aquí es **acompañante de solo lectura**: recibir la
alerta de una salida de valor anómala o de un cambio privilegiado sin aprobación
y ver el incidente. Eso no exige reescribir nada, y en el ecosistema ya existe
**RootCause Mobile Inspector** como vehículo natural si algún día se decide.

## 3. Decisión de lenguaje

### 3.1 Lo que hace realmente el código

Servidor HTTP en loopback, JSON, AES-256-GCM con la biblioteca criptográfica de
la plataforma, una cadena de hashes para la auditoría, un cliente JSON-RPC de
solo lectura y un motor de reglas determinista de unas 430 líneas. **Ninguna
primitiva criptográfica está implementada a mano**, no se ejecuta bytecode y no
hay cómputo pesado. Ese perfil no exige un lenguaje de sistemas.

### 3.2 Por qué hoy se queda en Node.js

- Funciona, está probado y se puede empaquetar hoy: ~2.400 líneas, cero
  dependencias, pruebas en verde y una edición de Windows que arranca y sirve el
  panel con inventario dentro. Reescribirlo no añadiría una sola capacidad.
- Cero dependencias significa que el argumento habitual contra Node —el árbol de
  `node_modules` como superficie de suministro— aquí no aplica: no hay árbol, y
  hay un gate de CI que tumba el build si alguien lo planta. Esto importa el
  doble en un proyecto blockchain, donde el camino cómodo es instalar el SDK de
  cada cadena y acabar con centenares de paquetes transitivos vigilando... la
  cadena de suministro de otros.
- El valor de este repositorio está en el conocimiento del dominio (las reglas,
  el catálogo de controles, los runbooks), no en el rendimiento del proceso.

### 3.3 El coste real de esta decisión

Hay que decirlo con todas las letras: empaquetar `node.exe` significa **cargar
con el runtime**. El ZIP pesa ~32 MB en vez de ~5 MB, y cada vulnerabilidad de
Node obliga a publicar una versión nueva de la aplicación aunque el código
propio no haya cambiado. Es una obligación de mantenimiento periódica, no un
detalle: está anotada en [WINDOWS-APP.md](WINDOWS-APP.md).

### 3.4 Rust: el destino probable, con disparadores explícitos

Rust es la respuesta correcta *cuando* ocurra alguna de estas cinco cosas, y no
antes:

1. **Simulación o ejecución de bytecode.** Si hay que simular una transacción
   antes de aprobarla, hacer diffing de bytecode entre implementaciones de un
   proxy, o decompilar para verificar que el código desplegado corresponde a la
   fuente, la respuesta es `revm` y el ecosistema de Foundry. Ese es el
   disparador más probable, y no tiene equivalente cómodo en Node.
2. **Volumen de indexación.** Si el observador deja de ser un muestreo de
   cabeceras y pasa a reprocesar rangos largos de logs de varias cadenas a la
   vez, el perfil de trabajo cambia de I/O a cómputo y la elección importa.
3. **Fusión con RootCause Windows Inspector.** Ese producto ya es Rust. Si esto
   deja de ser un módulo aparte y pasa a ser una capacidad suya, se escribe en
   su lenguaje.
4. **Distribución corporativa.** Un único `.exe` firmado, pequeño y sin runtime
   que parchear encaja mucho mejor en despliegues gestionados y en firma de
   código.
5. **Servicio permanente.** Si el watchtower deja de ser un panel abierto y pasa
   a ser un servicio de Windows corriendo siempre, importan la huella de memoria
   y el arranque.

### 3.5 Go: la respuesta honesta es «es competitivo, pero no gana»

En el ADR del repositorio Bitcoin, Go se descarta rápido. **Aquí no se puede
descartar rápido, y fingir lo contrario sería deshonesto:**

- `go-ethereum` (geth) es *la* implementación de referencia de Ethereum, y está
  escrita en Go. Cosmos SDK, Tendermint/CometBFT y buena parte del stack de
  Cosmos también.
- Si algún día hay que incrustar un cliente ligero, hablar P2P con una red, o
  reutilizar tipos y ABI de geth, Go sería el camino con menos fricción.
- Un binario estático sin runtime resuelve el mismo problema de distribución que
  Rust, con una curva de aprendizaje bastante más corta.

Se elige Rust igualmente por tres razones concretas, no por gusto:

1. **La herramienta que este producto necesitaría es de análisis, no de nodo.**
   Simulación (`revm`), tipado de EVM (`alloy`), fuzzing y trazas: ahí el
   ecosistema Rust está claramente por delante, y es justo el trabajo que
   dispararía la migración.
2. **Coherencia de familia.** RootCause Windows Inspector ya es Rust. Elegir Go
   dejaría la familia en cuatro lenguajes (Rust en escritorio, Node en web, Dart
   en móvil, Go aquí) sin ganancia proporcional.
3. **Sin coste de oportunidad hoy.** Como la migración no es inminente, la
   decisión puede tomarse con el disparador delante. Si el disparador acabara
   siendo «hablar con una red Cosmos a nivel de protocolo» en vez de «simular
   EVM», esta parte del ADR debe reabrirse y Go ganaría.

## 4. Cómo se migraría sin tirar el trabajo

La migración, si llega, no empieza por el servidor:

1. **La costura es la API HTTP.** [API.md](API.md) es el contrato. Mientras se
   respete, el panel actual —HTML, CSS y JS sin dependencias— sigue funcionando
   servido por un binario Rust sin tocar una línea de frontend.
2. **Primero el dominio.** `src/domain/` (reglas, riesgo, guardia de secretos)
   son funciones puras: se portan y se comparan contra los mismos casos.
3. **Las pruebas actuales son la suite de aceptación.** `test/` y
   `scripts/check-security-claims.js` describen el comportamiento observable; el
   binario Rust tiene que superarlos igual, ejecutándose contra su propio
   proceso.
4. **Convivencia posible.** Nada impide que la primera versión Rust reutilice
   este repositorio como especificación ejecutable durante la transición.

## 5. Consecuencias

- Se mantiene Node.js y se invierte en el empaquetado de Windows: instalador por
  usuario, edición portable, verificación de arranque real en CI.
- Se asume la obligación de republicar cuando Node publique parches de
  seguridad.
- Se documentan cinco disparadores concretos para Rust, de modo que la decisión
  futura sea una comprobación, no una discusión.
- Se descarta explícitamente el SaaS multi-tenant alojado, y se deja soportado
  el self-hosting, que es una cosa distinta.
- Se deja constancia de que Go es una alternativa razonable en este dominio y de
  cuál sería el escenario que le daría la razón.
