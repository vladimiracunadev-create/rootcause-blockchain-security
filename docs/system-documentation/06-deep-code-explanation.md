# 06 · Explicación profunda del código

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

Este documento explica **cómo funciona** el código, no solo qué hace. Las
funciones triviales se despachan en una línea; las que concentran una decisión
de diseño se explican por bloques lógicos o por caminos de ejecución.

Cada sección cita el archivo y el símbolo. Los fragmentos de código son
mínimos: solo aparecen cuando la prosa no basta.

---

## 1. Arranque: `src/server.js`

### Objetivo

Componer el sistema entero en un objeto y publicarlo en un puerto local.

### Entrada y salida

- **Entrada:** el entorno (`process.env`), que puede inyectarse para pruebas.
- **Salida:** `buildRuntime` devuelve `{application, config, service,
  intelligence, connectors, watchtower}`. `startServer` añade `server`.

### Flujo interno de `buildRuntime(env)`

1. **Configuración y guarda de producción.** `loadConfig(env)` y
   `assertProductionConfig(config)`. Si el modo es persistente y falta la clave,
   aquí termina todo, antes de tocar disco.
2. **Carga de catálogos en paralelo.** Los cuatro JSON de `config/` se leen con
   un único `Promise.all`. Se leen **una vez**: cambiarlos exige reiniciar.
3. **Elección del estado inicial.** `config.demoMode ? createDemoState() :
   createEmptyState()`.
4. **Elección del almacén.** `MemoryStore` en demo, `EncryptedFileStore` en
   persistente. Es una decisión de una línea gracias a que ambos comparten el
   contrato implícito `load()` / `save()`.
5. **Cliente EVM.** `new EvmRpcClient(config.evm)`. **Detalle importante:** el
   constructor valida el endpoint de inmediato, así que una `EVM_RPC_URL`
   inválida o remota sin permiso **impide el arranque** en vez de fallar en la
   primera consulta.
6. **Servicio de defensa e inicialización.** `service.initialize()` carga el
   estado, completa los arrays que falten, ejecuta una primera evaluación y
   guarda. Consecuencia: la aplicación nunca arranca sin haber evaluado su
   propio inventario.
7. **Registro de conectores.** Se registran `DatasetConnector` (vacío) y
   `EvmRpcConnector`. `BitcoinRpcConnector` existe pero **no se registra**.
8. **Servicio de inteligencia.**
9. **Precarga de la demo.** Solo si `demoMode`: ingiere seis datasets
   (`02-fan-in`, `04-peeling-chain`, `06-address-poisoning`,
   `08-drainer-simulado`, `09-post-exploit`, `10-falso-positivo`) y ejecuta un
   análisis. El comentario del código lo justifica: «una consola de inteligencia
   vacía no permite comprobar nada».
10. **Aplicación HTTP y watchtower.**

### Decisiones condicionales relevantes

| Condición | Rama A | Rama B |
|---|---|---|
| `config.demoMode` | memoria + datos de demostración + precarga | archivo cifrado + estado vacío |
| `ROOTCAUSE_OPEN_BROWSER === "1"` **y** host loopback | abre el navegador | no hace nada |
| `process.argv[1]` es este archivo | arranca el servidor | solo exporta (modo librería) |

Ese último detalle es lo que permite que las pruebas y
`scripts/check-security-claims.js` importen `startServer` sin que el módulo
arranque un servidor por el mero hecho de importarlo.

### `openBrowserIfRequested(env, config, url)` — línea por línea

~~~js
if (String(env.ROOTCAUSE_OPEN_BROWSER || "") !== "1") return false;
const host = String(config.host || "").replace(/^\[|\]$/g, "");
const isLoopback = host === "localhost" || host === "::1" || host.startsWith("127.");
if (!isLoopback) return false;
~~~

- **Línea 1:** el comportamiento es *opt-in*. Un despliegue de servidor no pone
  esa variable y por tanto nunca abre nada.
- **Línea 2:** quita los corchetes de una dirección IPv6 literal (`[::1]`), que
  es como llega en una URL.
- **Línea 3:** `startsWith("127.")` cubre todo el bloque de loopback IPv4, no
  solo `127.0.0.1`.
- **Línea 4:** segunda condición independiente. Aunque alguien ponga la variable
  a `1` en un servidor, si el bind no es loopback no se abre nada —y por tanto
  no se muestra una URL remota en la máquina equivocada.

El lanzamiento va envuelto en `try/catch` y el hijo se crea `detached`, con
`stdio: "ignore"`, `windowsHide: true` y `unref()`: si no hay navegador, la
aplicación **no falla**, simplemente devuelve `false`. Está probado en
`test/desktop-launch.test.js`.

---

## 2. Superficie HTTP: `src/app.js`

### Objetivo

Ser la única puerta de entrada y aplicar la postura de seguridad antes de que
nadie mire el contenido de la petición.

### Flujo interno de la función `application(request, response)`

El orden importa y es deliberado:

1. **Cabeceras de seguridad primero.** `applySecurityHeaders(response)` se
   ejecuta **antes** de cualquier validación. Consecuencia: incluso una respuesta
   de error 429 o 500 lleva la CSP completa. Si se aplicaran al final, el camino
   de error las perdería.
2. **`x-request-id`.** Un UUID por petición, útil para correlacionar el registro
   con lo que vio el cliente.
3. **Límite de ritmo.** Antes de leer el cuerpo: un atacante local no debería
   poder forzar la lectura de 128 KB por petición a ritmo ilimitado.
4. **Construcción de la URL** con la cabecera `host` como base.
5. **Bifurcación.**
   - Si la ruta empieza por `/api/`: `validateMutationRequest` y luego el router.
   - Si no: solo se admiten `GET` y `HEAD`; el resto es 405.
6. **Estáticos por mapa cerrado.** `STATIC_FILES[url.pathname]` es una búsqueda
   en un objeto congelado. **No hay concatenación de rutas con datos del
   usuario**, así que el *path traversal* es imposible por construcción, no por
   saneamiento.
7. **Caché diferenciada.** `sw.js` e `index.html` van con `no-cache`; el resto,
   `public, max-age=300`. Motivo: si el Service Worker quedara cacheado, una
   corrección podría no llegar nunca al usuario.
8. **`HEAD`** responde las cabeceras y termina sin cuerpo.

### Manejo de errores, bloque a bloque

~~~js
const status = Number(error.statusCode) || 500;
if (status >= 500) { console.error(JSON.stringify({ level: "error", event: "request_failed", ... })); }
return jsonResponse(response, status, {
  error: {
    code: error.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED"),
    message: status >= 500 ? "The request could not be completed." : error.message
  }
});
~~~

La asimetría es el punto: un error 4xx describe **lo que el cliente hizo mal** y
por tanto su mensaje es útil y no filtra nada; un error 5xx podría contener una
ruta del sistema de archivos, un mensaje de `fs` o una traza, así que el mensaje
real va al registro local y al cliente le llega una frase genérica.

### `createRateLimiter(limitPerMinute)` — y su límite honesto

Ventana fija de 60 segundos por dirección de origen, en un `Map` en memoria.

**Dos propiedades que hay que conocer:**

1. **No hay purga.** El `Map` crece con cada dirección distinta vista. En un
   despliegue loopback eso es una entrada; expuesto a una red, es un crecimiento
   sin cota. Ver [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).
2. **Ventana fija, no deslizante.** En el peor caso admite el doble del límite
   en un intervalo de un minuto que cruce el borde de dos ventanas. Es la
   simplificación habitual y aquí es aceptable porque el control real es el bind
   loopback, no el contador.

### `validateMutationRequest(request)` — dos comprobaciones, dos amenazas

~~~js
if (request.headers["x-rootcause-request"] !== "1") { … 403 MUTATION_HEADER_REQUIRED }
const fetchSite = request.headers["sec-fetch-site"];
if (fetchSite && !["same-origin", "none"].includes(fetchSite)) { … 403 CROSS_SITE_REQUEST_REJECTED }
~~~

- La **cabecera propia** neutraliza el CSRF clásico de formulario: un
  `<form method="post">` de una web cualquiera no puede añadir cabeceras
  personalizadas, y una petición `fetch` con cabecera personalizada dispara
  *preflight* CORS, que este servidor no responde.
- La comprobación de **`sec-fetch-site`** es defensa en profundidad para
  navegadores modernos. Nota el `if (fetchSite && …)`: si la cabecera **no
  viene** —`curl`, un script, un navegador antiguo— la comprobación se salta.
  Es coherente: esa cabecera es un metadato del navegador, no una credencial, y
  el control efectivo es el anterior.

---

## 3. Enrutado

### `src/api/router.js` · composición de dos routers

~~~js
if (intelligenceRouter && path.startsWith("/api/v1/")) {
  const handled = await intelligenceRouter(request, response, url, { actor, readJson });
  if (handled !== null) return handled;
}
~~~

El router de inteligencia devuelve `null` cuando no reconoce la ruta, y solo
entonces el control vuelve aquí. Es un encadenado explícito, sin framework de
middleware y sin acoplamiento: cada router conoce solo sus rutas.

### `actorFrom(request)` — el actor es una etiqueta, no una identidad

~~~js
const value = String(request.headers["x-rootcause-actor"] || "local-user");
return /^[a-z0-9._@-]{1,80}$/i.test(value) ? value : "local-user";
~~~

Valida **forma**, no autenticidad. Su función es evitar que una cabecera con
caracteres de control o de longitud absurda acabe escrita en la auditoría. Un
valor que no cumpla el patrón no produce un error: se sustituye por
`local-user`. La razón (inferencia) es que un actor mal formado no debe impedir
que se registre el hecho.

### `src/api/intelligence-router.js` · tabla de rutas

Las rutas son una lista de objetos `{method, pattern, handler}` que se recorre
en orden. Los patrones se construyen a partir de tres fragmentos reutilizables
(`NETWORK`, `ADDRESS`, `IDENTIFIER`) para que todas las rutas apliquen la misma
validación de forma sobre los parámetros.

El cuerpo solo se lee cuando el método lo admite:

~~~js
const body = ["POST", "PATCH", "PUT"].includes(method) ? await context.readJson(request) : {};
~~~

Esto significa que un `GET` con cuerpo simplemente lo ignora.

---

## 4. El guardián de secretos: `src/domain/secret-guard.js`

### Objetivo

Que el producto **no pueda** aceptar material privado, aunque alguien lo envíe
por error o a propósito.

### Flujo de `assertNoSecretMaterial(value, path)`

Es un recorrido recursivo con tres casos:

| Tipo de valor | Comportamiento |
|---|---|
| `null` / `undefined` | Retorna |
| Cadena | Si coincide con un patrón de secreto, **lanza** |
| Array | Recursa sobre cada elemento, componiendo la ruta `path[i]` |
| Objeto | Para cada clave: si el **nombre** está prohibido, lanza; si no, recursa |

La comprobación del nombre pasa por `compactKey`, que elimina todo lo que no sea
alfanumérico y pasa a minúsculas. Consecuencia práctica: `private_key`,
`privateKey`, `PRIVATE-KEY` y `private key` colapsan al mismo token
`privatekey`. Y como se usa `includes`, `deployerPrivateKey` también cae.

Los cuatro patrones de contenido son:

| Patrón | Qué detecta |
|---|---|
| `\b(?:xprv\|tprv)[1-9A-HJ-NP-Za-km-z]{40,}\b` | Clave extendida BIP-32 |
| `\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b` | Clave privada en formato WIF |
| `-----BEGIN (?:EC \|RSA )?PRIVATE KEY-----` | Bloque PEM |
| `https?://[^\s/:]+:[^\s/@]+@` | URL con usuario y contraseña |

### Caso límite conocido

Una frase semilla BIP-39 escrita como texto libre en un campo llamado, por
ejemplo, `notes`, **no** coincide con ninguno de los cuatro patrones. Lo que sí
la bloquea es el filtro de nombres si el campo se llama `mnemonic`, `seed` o
similar. **Inferencia:** la defensa es por nombre de campo más patrones de
formatos codificados; un texto en lenguaje natural puede colarse.
`redactForAudit` mitiga el daño truncando a 512 caracteres, pero no lo elimina.
Registrado en [15 · Riesgos](15-risks-and-technical-debt.md).

---

## 5. Motor de reglas: `src/domain/rule-engine.js`

### Objetivo

Convertir un estado en una lista de hallazgos, de forma pura y determinista.

### La pieza que sostiene todo el ciclo de vida: `findingId`

~~~js
crypto.createHash("sha256").update([code, entityId, discriminator].join("|")).digest("hex").slice(0, 20)
~~~

**Esto no es un identificador cualquiera.** Es lo que hace que un incidente sea
*el mismo incidente* entre dos ejecuciones. Si mañana vuelve a detectarse el
mismo problema en la misma entidad, el `id` coincide, `mergeIncidents` lo
reconoce y conserva su `createdAt` y su estado `acknowledged`. Si el problema
desaparece, el `id` deja de aparecer y el incidente se resuelve solo.

**Riesgo al modificar:** cambiar `code`, `entityId` o `discriminator` de una
regla existente rompe esa continuidad. El incidente antiguo se marcará como
resuelto y aparecerá uno nuevo con historia vacía. Si hay que cambiarlo,
conviene hacerlo con un cambio de versión anunciado.

### `severityFor(project, high, lower)` — la severidad depende del contexto

~~~js
return ["critical", "high"].includes(project.criticality) ? high : lower;
~~~

La misma condición técnica es más grave en un contrato de tesorería de
producción que en un despliegue de pruebas. Es un ajuste de una línea con un
efecto notable: sin él, el panel de un equipo con muchos entornos de prueba se
llenaría de rojos irrelevantes.

### `evaluateProject` — recorrido por bloques

| Bloque | Colección recorrida | Condición | Código |
|---|---|---|---|
| 1 | `project.contracts` | `!contract.verifiedSource` | `BLK-CONTRACT-001` |
| 2 | `project.contracts` | `admin.type === "eoa"` | `BLK-ACCESS-001` |
| 3 | `project.contracts` | multisig con `owners < 2`, `threshold < 2` o `threshold > owners` | `BLK-ACCESS-002` |
| 4 | `project.contracts` | `upgradeable` y demora menor que la política | `BLK-UPGRADE-001` |
| 5 | `project.oracles` | proveedores por debajo de la política **y** sin fallback | `BLK-ORACLE-001` |
| 6 | `project.oracles` | edad del feed > 2 × heartbeat | `BLK-ORACLE-002` |
| 7 | `project.bridges` | ratio umbral/firmantes bajo **u** operadores independientes insuficientes | `BLK-BRIDGE-001` |
| 8 | `project.governance` | modelo distinto de `none` y timelock por debajo de la política | `BLK-GOV-001` |
| 9 | `project.dependencies` | `!pinned` **o** `!provenanceVerified` | `BLK-SUPPLY-001` |

Dos detalles de lógica que merecen atención:

- **Bloque 5 usa `&&`, el bloque 9 usa `||`.** No es un descuido: pocos
  proveedores *con* fallback es una situación gestionada, mientras que una
  dependencia sin fijar *o* sin procedencia ya es un problema por sí sola.
- **Bloque 6, el caso de la fecha ausente:**

  ~~~js
  const updatedAt = Date.parse(oracle.lastUpdateAt || "");
  const allowedAgeMs = Number(oracle.heartbeatSeconds || 0) * 2 * 1000;
  if (!Number.isFinite(updatedAt) || allowedAgeMs <= 0 || now - updatedAt > allowedAgeMs) { … }
  ~~~

  Un oráculo **sin** `lastUpdateAt` o **sin** `heartbeatSeconds` dispara el
  hallazgo. Es la elección segura: la ausencia de dato se trata como fallo, no
  como aprobación. Un oráculo del que no sabemos si está vivo no es un oráculo
  sano.

### `evaluateEvent` — la condición doble de `BLK-FUNDS-001`

~~~js
Number(event.amountUsd || 0) >= Number(policies.abnormalOutflowUsd) &&
Number(event.amountUsd || 0) >= Math.max(Number(event.baselineUsd || 0) * 5, 1)
~~~

Exige **las dos cosas**: superar el umbral absoluto de política *y* quintuplicar
la línea base del proyecto. El `Math.max(..., 1)` evita que una línea base de
cero convierta la segunda condición en trivialmente cierta.

Consecuencia buscada: un protocolo que mueve millones a diario no genera un
incidente por cada movimiento grande —solo por los que se salen de su propio
patrón—. Y un protocolo pequeño no genera uno por un movimiento anómalo que en
términos absolutos es irrelevante.

### `evaluateNode` — el observador también se vigila

La primera rama es un `return` temprano: si el nodo no está conectado, se emite
`BLK-NODE-001` y **no se evalúa nada más**, porque `chainId` y `blockNumber` no
existirían. Las otras dos reglas se acumulan en un array: un nodo puede estar a
la vez en la red equivocada y atrasado.

---

## 6. Reglas de wallet: `src/domain/wallet-rules.js`

### Objetivo

Evaluar la postura de cuentas públicas vigiladas a partir de eventos on-chain
normalizados, sin tocar nunca una clave.

### Las proyecciones: `latestAllowances` y `latestOperators`

~~~js
for (const event of sortChain(events)) {
  if (event.type !== "wallet.allowance.changed") continue;
  const key = [event.chainId, lower(event.walletAddress), lower(event.contractAddress), lower(event.spender)].join("|");
  map.set(key, event);
}
~~~

`sortChain` ordena por `blockNumber` y, en empate, por `logIndex`. Como el `Map`
sobrescribe, **el último evento de la cadena gana**. Consecuencia directa: una
revocación —un evento con `amountRaw = "0"`— apaga la autorización anterior sin
necesidad de lógica adicional. La proyección es el estado actual.

El orden por `(blockNumber, logIndex)` y no por `observedAt` es importante: el
orden que manda es el de la cadena, no el de cuándo se enteró el colector.

### `checkAllowanceRules` — tres causas, un código

Un allowance genera `BLK-WALLET-001` si es **ilimitado**, si **supera el límite
del activo** o si está **caducado**. Las tres se acumulan en `causes[]` y la
explicación las lista todas. La severidad distingue:

~~~js
severity: unlimited || overLimit ? severityForAccount(account, "critical", "high") : severityForAccount(account)
~~~

Un allowance ilimitado o por encima del límite es peor que uno correcto pero
antiguo.

**Guarda de calidad del dato:**

~~~js
if (amount === null || amount === 0n) continue; // revocación o dato inválido: no hay exposición activa
~~~

Un `amountRaw` que no se puede convertir a entero **no produce hallazgo**. La
prueba «incomplete evidence (invalid amountRaw) never produces an allowance
finding» de `test/wallet-rules.test.js` protege exactamente eso. La regla es:
mejor no decir nada que decir algo sobre un dato que no se entiende.

### `checkPoisoningRules` — el detector más delicado, y el más cauto

Es el único con `confidence: "heuristic"`. Exige **dos señales independientes**:

1. **Similitud visual obligatoria.** Se compara la contraparte contra cada
   contraparte conocida con `sharedPrefix` y `sharedSuffix`, que cuentan
   caracteres coincidentes tras quitar el `0x`. Basta con superar el mínimo de
   prefijo **o** el de sufijo, y entre todas las candidatas se elige la de mayor
   `prefix + suffix`. Si no hay ninguna, `continue`: no hay hallazgo.
2. **Monto cero o dust.** Se busca la política del activo; si no hay,
   `wallet.defaultDustThresholdRaw`. Si el monto no es cero ni está por debajo
   del umbral, `continue`.

Y una tercera condición previa: la contraparte **no** puede estar en
`knownCounterparties`.

Por qué tanta cautela: el patrón de *address poisoning* consiste en enviar una
transferencia irrelevante desde una dirección parecida a una que la víctima usa,
para que aparezca en su historial y alguien la copie. Pero las direcciones
*vanity*, los contratos de fábrica con prefijo común y los exchanges producen
similitudes perfectamente legítimas. Por eso el hallazgo se llama **candidato**
y declara sus limitaciones en el propio objeto.

### `checkActivityRules` — un código, cuatro sub-causas

`BLK-WALLET-008` se emite desde cuatro puntos distintos, con
`discriminator` distinto en cada uno:

| Sub-causa | Condición | Política |
|---|---|---|
| Reactivación | Hueco ≥ `dormantAfterDays` seguido de actividad | `dormancyPolicy.dormantAfterDays` |
| Red no autorizada | `chainId` fuera del conjunto permitido | `wallet.allowedChainIds` |
| Fuera de ventana | Hora fuera de `activeHours` | `expectedActivity.activeHours` |
| Contraparte nueva | Contraparte fuera del registro | `knownCounterparties` |

`scripts/check-rule-coverage.js` normalmente falla si un código se emite desde
más de un sitio —esa duplicación suele indicar una regla copiada—, así que
`BLK-WALLET-008` está declarado como excepción explícita en `MULTI_EMITTERS`.
Es un buen ejemplo de gate que documenta su propia excepción en vez de
desactivarse.

---

## 7. Modelo de inteligencia: `src/domain/intelligence/model.js`

### La validación de direcciones Bitcoin, implementada a mano

Es la parte del repositorio donde más claramente se paga el precio de «cero
dependencias», y donde más claramente se cobra el beneficio: «validación
estricta de direcciones» pasa de ser una promesa a ser código auditable.

**`isValidBase58Check(address)`** — cuatro pasos:

1. `base58Decode` convierte el texto a un entero grande acumulando
   `value * 58n + índice`, y luego lo trocea en bytes.
2. Cada `'1'` inicial del texto se traduce a un byte cero significativo
   —peculiaridad de base58 que, omitida, produciría direcciones válidas
   rechazadas.
3. Se exige longitud 25: 1 byte de versión + 20 de hash + 4 de checksum.
4. Se recalcula `sha256(sha256(payload))` y se comparan los 4 primeros bytes
   con el checksum. **Es la comprobación real, no una validación de forma.**

**`isValidBech32(address, expectedHrp)`** — el detalle fino está al final:

~~~js
const witnessVersion = data[0];
if (witnessVersion === 0) return checksum === BECH32_CONSTANT;      // 1
if (witnessVersion >= 1 && witnessVersion <= 16) return checksum === BECH32M_CONSTANT; // 0x2bc830a3
return false;
~~~

Segwit v0 usa bech32 y v1+ (taproot) usa bech32m, que se diferencian **solo** en
la constante final del polinomio. Confundirlas haría que las direcciones taproot
se rechazaran o —peor— que se aceptara una dirección con checksum inválido.
`test/intelligence-model.test.js` incluye casos negativos con checksum alterado.

Antes hay una comprobación de mayúsculas que es fácil pasar por alto:

~~~js
if (address !== lowered && address !== address.toUpperCase()) return false;
~~~

Bech32 permite todo en minúsculas o todo en mayúsculas, **nunca mezclado**,
precisamente porque la mezcla rompe el checksum.

### `normalizeTransaction` — el puente entre dos familias de cadena

El sistema soporta un modelo UTXO (Bitcoin) y uno de cuentas (Ethereum). El
grafo se construye sobre `transfers`, y ambas familias tienen que producirlo.

Para UTXO, `transfers` se **deriva**:

~~~js
if (!transfers.length && (inputs.length || outputs.length)) {
  for (const output of outputs) {
    const funder = inputs.find((entry) => entry.address) || null;
    transfers.push({ from: funder?.address || null, to: output.address, amountRaw: output.amountRaw,
                     kind: funder ? "utxo-derived" : "coinbase", … });
  }
}
~~~

**Y aquí está la honestidad del diseño:** el `kind` es `"utxo-derived"`, no
`"transfer"`. En una transacción UTXO con varias entradas no existe una
correspondencia real entrada→salida; atribuir cada salida a la primera entrada
con dirección es una **simplificación estructural**, y el código la marca como
tal para que quien lea el grafo sepa que esa arista es una inferencia, no un
hecho observado.

**Limitación derivada, que conviene tener presente:** el grafo de Bitcoin así
construido sobreestima la relación con la primera entrada e ignora las demás.
Documentado en [`../BLOCKCHAIN-FORENSICS.md`](../BLOCKCHAIN-FORENSICS.md).

### `formatAmount(rawValue, decimals)` — por qué no hay coma flotante

~~~js
const text = amount.toString().padStart(places + 1, "0");
const whole = text.slice(0, text.length - places);
const fraction = text.slice(text.length - places).replace(/0+$/, "");
return fraction ? whole + "." + fraction : whole;
~~~

Se compone la cadena decimal por manipulación de texto sobre un `BigInt`. Nunca
se divide. Motivo: un `Number` de JavaScript pierde precisión por encima de
2⁵³, y 1 ETH son 10¹⁸ wei. Un redondeo en un informe forense es un dato falso, y
un dato falso en un informe forense es peor que no tener informe.

### `makeEvidence` — evidencia sellada

El hash se calcula sobre `JSON.stringify(payload)` **tal cual**, sin
canonicalizar claves —a diferencia de la auditoría, que sí canonicaliza—. Es
coherente con el propósito: la auditoría demuestra *qué pasó* y necesita ser
independiente del orden; la evidencia sella *este objeto exacto*. No existe
ninguna operación de edición: solo `attachEvidence` y `verifyEvidence`.

---

## 8. Motor de indicadores: `src/domain/intelligence/indicators.js`

### Objetivo

Producir señales investigables y reproducibles. **Nunca** conclusiones.

### El índice de actividad, la estructura que lo sostiene todo

`buildActivityIndex(transactions)` recorre todas las transferencias una vez y
construye un `Map` por dirección con:

- `incoming[]` y `outgoing[]`, cada registro con `txid`, la transacción, la
  transferencia, el instante en milisegundos y el monto como `BigInt`;
- `transactions`, un `Map` de las transacciones que tocan la dirección;
- `all[]`, la unión ordenada cronológicamente.

Las tres listas se ordenan por `(instante, txid)`. El desempate por `txid` es lo
que garantiza que dos transacciones del mismo bloque siempre se recorran en el
mismo orden, y por tanto que el resultado sea **idéntico entre ejecuciones**.

Coste: un recorrido lineal por transferencia más el ordenado, `O(n log n)`. Se
reconstruye en cada `analyze()`.

### `makeIndicator` — de dónde sale cada campo

| Campo | Origen |
|---|---|
| `id` | `stableId("indicator", indicador, sujeto, discriminador)` |
| `title`, `description`, `family` | **Del catálogo JSON**, no del código |
| `severity` | Del detector si lo especifica; si no, del catálogo |
| `confidence` | `deriveConfidence(catálogo, fiabilidad de la fuente, ¿señal fuerte?)` |
| `falsePositives`, `recommendedAction` | **Del catálogo**, siempre presentes |
| `source` | `aggregateSource`: la fiabilidad **mínima** de las fuentes implicadas |
| `thresholdsApplied` | Los umbrales concretos que se usaron |

Que el texto venga del catálogo y no del código es lo que hace posible el gate
de cobertura: un indicador que el motor emite pero que no está en el catálogo
haría fallar `makeIndicator` con un `undefined`, y antes de eso hace fallar
`scripts/check-rule-coverage.js`.

### `deriveConfidence` — la fuente limita la señal

~~~js
let index = Math.max(0, order.indexOf(defaultConfidence));
if (strong && index < 2) index += 1;
if (reliability < 0.5 && index > 0) index -= 1;
if (reliability < 0.35) index = 0;
~~~

Una señal fuerte sube un nivel; una fuente dudosa lo baja; una fuente muy dudosa
lo colapsa a `low` sin importar lo fuerte que fuera la señal. El principio: **una
señal fuerte sobre un dato dudoso no es una señal fuerte.**

### `detectPeelingChain` — el detector más complejo, explicado por bloques

Una *peeling chain* es la cadena en la que cada transacción desprende un importe
pequeño y traslada el resto a una dirección nueva. Es un patrón asociado a
alejar fondos de su origen —y también a la gestión normal de cambio en carteras
UTXO, que es exactamente por qué el catálogo lo declara como falso positivo.

**Bloque 1 — punto de partida.** Se prueba cada transferencia saliente de la
dirección como posible inicio de cadena.

**Bloque 2 — el bucle de seguimiento, con guarda.**

~~~js
let guard = 0;
while (guard++ < 12) { … }
~~~

La guarda de 12 saltos es la protección contra un ciclo en los datos. Sin ella,
un conjunto de transacciones que se realimenten colgaría el proceso.

**Bloque 3 — qué cuenta como eslabón.** Para cada transacción de la dirección
actual posterior al inicio:

1. se filtran las transferencias salientes desde esa dirección;
2. si hay menos de dos, no es un eslabón —una peel necesita resto **y**
   desprendimiento—;
3. se ordenan de mayor a menor con comparación `BigInt`;
4. `remainder` es la mayor, `peel` la segunda;
5. se exige `remainder ≥ minimumRemainderPercent` del total **y**
   `peel ≤ maximumPeelPercent`. Con los valores por defecto: el resto es al
   menos el 70 % y el desprendimiento como mucho el 30 %.

**Bloque 4 — avance.** `currentKey` pasa a ser el destino del `remainder`: se
sigue el dinero, no el desprendimiento.

**Bloque 5 — selección.** Entre todas las cadenas encontradas se conserva la más
larga, y solo se emite si alcanza `minimumLinks` (3 por defecto). Una cadena de
5 o más se marca `strong: true`, lo que sube la confianza un nivel.

Nota sobre los porcentajes: `percent(part, whole)` multiplica por `10000n` en
aritmética `BigInt` **antes** de convertir a `Number`, para no perder precisión
en montos grandes.

### `evaluateIndicators` — orquestación y determinismo

1. Se indexa el catálogo por `id`.
2. Se construye el índice de actividad.
3. Se recorren las direcciones **ordenadas por clave**.
4. Por dirección se ejecutan 8 detectores que devuelven a lo sumo un indicador
   (se filtran los `null`) y 4 que devuelven listas.
5. Fuera del bucle se ejecutan `detectCoordination` y
   `detectAssetConcentration`, que necesitan ver **todas** las direcciones a la
   vez.
6. Se deduplica por `id` con un `Map` y se ordena por `(subject, indicator)`.

Los pasos 3 y 6 son lo que convierte «determinista» en una propiedad real y no
en una aspiración.

---

## 9. Grafo de fondos: `src/domain/intelligence/graph.js`

### `buildFundsGraph` — construcción

Nodo = dirección; arista = una transferencia observada. Se acumulan
`receivedRaw` y `sentRaw` como `BigInt`, y `transactionIds` como `Set`.

`publicNode` convierte los `BigInt` a cadena antes de serializar: `JSON.stringify`
lanza `TypeError` con `BigInt`. Es una de esas conversiones que, si se olvidan,
fallan solo en el camino de respuesta HTTP.

### `traverse` — BFS con tres cotas independientes

El bucle exterior avanza por profundidad; el interior expande la frontera
**ordenada**. Tres cortes distintos:

| Corte | Efecto | Motivo registrado |
|---|---|---|
| `collectedEdges.size >= maxEdges` | `break` del bucle de candidatos | `max-edges` |
| `visited.size >= maxNodes` | `continue`: no se añade el vecino | `max-nodes` |
| `depth + 1 >= maxDepth` con frontera pendiente | Marca | `max-depth` |

La diferencia entre `break` y `continue` es intencionada: al agotar aristas se
abandona la expansión de ese nodo; al agotar nodos se siguen recogiendo aristas
hacia nodos ya visitados, que son información útil.

**El resultado siempre declara `truncated` y `truncationReasons`.** Un grafo
truncado que se presentara como completo llevaría a concluir que unos fondos no
llegaron a ninguna parte cuando en realidad la búsqueda se detuvo.

### `findPaths` — DFS recursivo con caminos simples

`if (trail.includes(edge.to)) continue;` impide repetir nodo. Es una búsqueda
`O(ramificación^profundidad)` en el peor caso, acotada por `maxDepth` (4 por
defecto, 6 como máximo absoluto) y `maxPaths` (10 por defecto, 25 máximo). Sin
esas cotas, un grafo denso agotaría la pila.

### `detectCycles` — DFS iterativo y firma canónica

Usa una pila explícita en vez de recursión. La deduplicación es lo interesante:

~~~js
const signature = [...trail].sort().join(">");
~~~

Ordenar los nodos del ciclo antes de firmarlo hace que el mismo ciclo
descubierto desde cualquiera de sus miembros produzca la misma firma, y por
tanto se cuente una vez.

### `distanceToFlagged` — BFS **no dirigido**

Recorre `outgoing` **e** `incoming`. Es deliberado: para la proximidad importa
la cercanía en el grafo de valor, no la dirección del flujo. Recibir de una
dirección marcada y enviarle son ambos hechos relevantes.

Devuelve `{distance: null, truncated: true}` si agota `GRAPH_LIMITS.maxNodes`, y
`assessRisk` lo convierte en una limitación explícita: «la búsqueda de
proximidad se truncó; la distancia real podría ser menor».

### `findCommunities` — la agrupación más conservadora posible

Componentes conexos ignorando la dirección, con DFS iterativo. Cada comunidad
lleva su `caveat`: «Componente conexo por transferencias observadas; no implica
titularidad común». No es *clustering* por heurística de propiedad común de
entradas: es estrictamente conectividad observada.

---

## 10. Puntaje explicable: `src/domain/intelligence/risk-score.js`

### Objetivo

Producir un número **que se pueda discutir**. La motivación está escrita en la
cabecera del archivo: un número sin explicación acaba usándose como veredicto.

### `assessRisk` — los seis bloques

**Bloque 1 · Indicadores activos.** Se agrupan por tipo de indicador. Por cada
grupo:

~~~js
const points = Math.round((base + repetition) * factor * confidenceMultiplier);
~~~

- `base` = peso de la severidad (`critical: 40 … low: 6`).
- `repetition` = 3 puntos por ocurrencia adicional, con tope 12. Que un patrón
  se repita suma, pero poco: cinco fan-in no son cinco veces más graves que uno.
- `factor` = decaimiento por antigüedad.
- `confidenceMultiplier` = 1 / 0,85 / 0,7.

**Bloque 2 · Proximidad en el grafo.** 30 puntos a distancia 0, 18 a 1, 10 a 2,
5 a 3, 2 a 4. Lleva su propio `caveat` incrustado: «una dirección puede recibir
fondos sin conocer su origen».

**Bloque 3 · Penalización por fiabilidad.** `(1 − fiabilidadMínima) × 15`, en
negativo. Una fuente pobre no debe sostener un puntaje alto.

**Bloque 4 · Atenuantes.** Cuatro, todos negativos: contraparte etiquetada
localmente (−12), historial largo y consistente (−8), aprobación revocada
después (−10), un único indicador de baja confianza (−6).

**Bloque 5 · Puntaje y banda.** Suma, acotado a 0–100, y resolución de banda.

**Bloque 6 · Confianza del análisis.** Deliberadamente **independiente** del
puntaje:

~~~js
if (distinctIndicators >= 3 && lowestReliability >= 0.75) analysisConfidence = "high";
else if (distinctIndicators >= 1 && lowestReliability >= 0.5) analysisConfidence = "medium";
~~~

Se puede tener un puntaje de 80 con confianza baja —una señal fuerte sobre una
fuente dudosa— y el resultado lo dice. Separar «cuánto riesgo» de «cuánto lo
respalda la evidencia» es probablemente la decisión más valiosa de este módulo.

### `ageFactor` — decaimiento con suelo

~~~js
const decayed = 0.5 ** (ageDays / config.halfLifeDays);
const floor = 1 - config.maximumDecayPercent / 100;
return { factor: clamp(decayed, floor, 1), ageDays: Math.round(ageDays) };
~~~

Semivida de 90 días, con un suelo del 40 % (decaimiento máximo del 60 %). El
suelo importa: **un hecho antiguo sigue siendo un hecho**. Sin él, una señal de
hace tres años valdría cero y el sistema olvidaría.

### Las limitaciones se construyen dinámicamente

Tres limitaciones son fijas. Otras tres se añaden según el caso: sin
indicadores, con proximidad truncada, o con fuente poco fiable. Y
`requiresHumanReview` es `true` en **todas** las ramas: no existe un camino que
lo ponga en `false`.

---

## 11. Servicio de defensa: `src/services/defense-service.js`

### `mutate(mutator)` — la pieza que evita perder escrituras

~~~js
async mutate(mutator) {
  const operation = this.writeQueue.then(async () => {
    const state = await this.store.load();
    const result = await mutator(state);
    state.updatedAt = new Date().toISOString();
    await this.store.save(state);
    return result;
  });
  this.writeQueue = operation.catch(() => {});
  return operation;
}
~~~

**Por qué existe.** El estado es un único archivo. Sin serialización, dos
peticiones concurrentes harían *load → modify → save* solapados y la segunda
escritura perdería los cambios de la primera.

**Por qué `this.writeQueue = operation.catch(() => {})` y no `= operation`.** Si
la cola guardara la promesa rechazada, todas las operaciones encadenadas después
heredarían el rechazo y el servicio quedaría inutilizable tras el primer error.
Con el `catch`, el fallo se propaga **solo** a quien llamó —porque se devuelve
`operation`, no la versión con `catch`— y la cola continúa limpia.

**Limitación conocida:** esta serialización es *intra-proceso*. Dos procesos
apuntando al mismo `DATA_DIR` sí pueden pisarse. No hay bloqueo de archivo. Ver
[15 · Riesgos](15-risks-and-technical-debt.md).

### `initialize()` — migración perezosa

Comprueba y crea cada array que falte sin tocar el resto:

~~~js
if (!Array.isArray(state.watchedAccounts)) state.watchedAccounts = [];
if (!Array.isArray(state.walletEvents)) state.walletEvents = [];
~~~

El comentario del código lo explica: «los inventarios previos a 0.2.0 no tenían
postura de wallets; se crean vacíos sin tocar el resto del estado». Es
migración hacia adelante sin script de migración, viable porque el modelo solo
ha añadido campos.

Además, siembra la auditoría si está vacía con `application_initialized` y
ejecuta una primera evaluación completa antes de guardar.

### `normalizeWatchedAccount` — lo que **no** acepta

El comentario del código es explícito: «Deliberadamente NO admite nombre real,
correo, teléfono, ubicación, biometría ni material de respaldo: solo la
dirección pública, su propósito operativo y la política que la gobierna».

No es una omisión: es una decisión de privacidad implementada como ausencia de
campos. Lo que el normalizador no copia, no existe en el estado. Y lo que no
existe en el estado no puede filtrarse.

### `normalizeWalletEvent` — validación en dos fases

Primero se construye el objeto base común a los 7 tipos; después, un bloque
`if` por tipo añade y valida los campos específicos. Un `transactionHash` es
**siempre** obligatorio:

~~~js
if (!event.transactionHash) throw badRequest("transactionHash is required for wallet events.");
~~~

Sin procedencia no hay evento. Un hallazgo sin transacción que lo respalde no se
puede verificar en una segunda fuente, y verificar en una segunda fuente es el
primer paso de todos los runbooks del producto.

### `observeWalletEvent` — idempotencia por log

~~~js
const duplicate = state.walletEvents.find(
  (entry) => entry.chainId === event.chainId &&
             entry.transactionHash === event.transactionHash &&
             entry.logIndex === event.logIndex);
if (duplicate) return { event: duplicate, duplicate: true };
~~~

La tripleta `(chainId, transactionHash, logIndex)` identifica un log de forma
única en una cadena. Un colector que reenvíe el mismo lote tras un reinicio no
duplica nada.

**Coste:** es una búsqueda lineal sobre todos los eventos, dentro de la cola de
escritura. Con decenas de miles de eventos se nota. Registrado en
[15 · Riesgos](15-risks-and-technical-debt.md).

### `mergeIncidents` — el ciclo de vida completo, en 20 líneas

~~~js
byId.set(finding.id, {
  ...finding,
  createdAt: previous?.createdAt || now,
  lastSeenAt: now,
  status: previous?.status === "acknowledged" ? "acknowledged" : "open",
  acknowledgedAt: previous?.acknowledgedAt,
  acknowledgedBy: previous?.acknowledgedBy
});
~~~

Cuatro propiedades emergen de estas líneas:

1. **`createdAt` es la primera vez**, no la última: se conserva la antigüedad
   real del problema.
2. **`acknowledged` sobrevive** a la reevaluación. Sin esto, cada análisis
   borraría el trabajo de triaje del operador.
3. **`resolved` no sobrevive**: si un incidente resuelto vuelve a detectarse,
   vuelve a `open`. Correcto —el problema regresó.
4. **La resolución automática** del segundo bucle es lo que mantiene el panel
   limpio sin intervención: lo que ya no se detecta, se cierra con `resolvedAt`.

---

## 12. Servicio de inteligencia: `src/services/intelligence-service.js`

### `ingest(...)` — idempotencia y reorganizaciones

**Fase 1, fuera de la cola.** Normalización de bloques y transacciones. Si algo
está mal formado, se lanza **antes** de encolar nada: una entrada inválida no
llega a tocar el estado.

**Fase 2, dentro de `defense.mutate`.** Se construyen tres índices —bloques por
clave, bloques **no huérfanos** por altura, transacciones por clave— para que las
comprobaciones sean `O(1)`.

**Detección de reorganización:**

~~~js
const previous = blockByHeight.get(heightKey);
if (previous && previous.hash !== block.hash) {
  previous.orphaned = true; previous.orphanedAt = startedAt; previous.replacedBy = block.hash;
  for (const transaction of intelligence.transactions) {
    if (transaction.blockHash === previous.hash) { transaction.orphaned = true; … }
  }
  intelligence.ingestion.reorgs.push({ … });
}
~~~

**Dos bloques distintos a la misma altura significan que la cadena se
reorganizó.** La respuesta del sistema es **marcar, no borrar**. Motivo: la
historia descartada sigue siendo evidencia de lo que se observó en su momento, y
en una investigación eso importa. Las transacciones huérfanas se conservan pero
`activeTransactions()` las excluye del análisis, porque describirían una historia
que la cadena ya descartó.

**Coste conocido:** el bucle de marcado recorre **todas** las transacciones por
cada reorganización. Con el tope de 20 000 y reorganizaciones poco frecuentes es
asumible, pero es `O(reorgs × transacciones)`.

**Recorte por antigüedad.** Al superar `LIMITS`, se ordena y se conserva la
cola. Las transacciones por `timestamp`, los bloques por `height`.

### `analyze(actor)` — sincronización de alertas

~~~js
const existing = new Map(intelligence.alerts.map((alert) => [alert.indicatorHitId, alert]));
for (const indicator of indicators) {
  if (existing.has(indicator.id)) { existing.get(indicator.id).lastSeenAt = now; continue; }
  intelligence.alerts.push({ id: stableId("alert", indicator.id), … status: "new", history: [ … ] });
}
~~~

**Diferencia importante respecto a los incidentes de defensa:** una alerta que
deja de detectarse **no se cierra sola**. Se queda como está.

Es coherente con el dominio: un incidente de configuración describe un estado
presente —si la configuración se arregló, el incidente terminó—; una alerta de
investigación describe un hecho pasado —que los datos ya no lo muestren no
significa que no ocurriera—. El cierre de una alerta es siempre una decisión
humana registrada en su `history`.

### `assess(networkId, address, options)` — camino completo

1. Lee el estado y calcula la clave canónica.
2. `activeTransactions()` descarta las huérfanas.
3. Filtra los indicadores cuyo `subject` es este sujeto.
4. **Reconstruye el grafo entero** y calcula la proximidad a las direcciones
   marcadas.
5. Recoge el contexto atenuante: etiqueta local, `firstSeen` del nodo, si hay un
   `INT-BEHAV-004` (cambio de comportamiento) y si se observó una revocación.
6. Llama a `assessRisk`.
7. Envuelve el resultado con `observed`, `indicators` completos, `proximity` con
   su `caveat` y **`dataScope`**.

`dataScope` merece atención:

~~~js
dataScope: {
  transactionsAnalyzed: transactions.length,
  orphanedExcluded: intelligence.transactions.length - transactions.length,
  lastIngestAt: intelligence.ingestion.lastRunAt
}
~~~

Dice **sobre qué** se calculó el resultado. Un puntaje bajo con
`transactionsAnalyzed: 12` significa algo muy distinto que el mismo puntaje con
20 000. Sin ese campo, un consumidor no puede distinguirlos.

**Coste:** el paso 4 reconstruye el grafo en cada llamada. Es la operación más
cara de la API. Registrado en [15 · Riesgos](15-risks-and-technical-debt.md).

### `assessTransactionIntent(input)` — consultivo por construcción

Evalúa la contraparte, acumula advertencias y devuelve **siempre**:

~~~js
decision: "advisory-only",
notice: "RootCause no construye, firma ni transmite transacciones. Este análisis es informativo y no autoriza ni bloquea ninguna operación."
~~~

No hay ninguna rama que devuelva `allow` o `deny`. La comprobación de address
poisoning es especialmente útil: si el origen tiene un `INT-EXPO-002` cuyo
`suspiciousAddress` coincide con el destino que se va a usar, se advierte
explícitamente. Es el momento exacto en que esa información vale algo.

### `caseReport(caseId)` — el informe y su aviso epistémico

Reúne caso, alertas, indicadores, evidencia con su verificación de integridad, y
**recalcula** una evaluación por cada sujeto implicado. Añade un
`epistemicNotice` que clasifica el contenido del informe en hechos observados,
indicadores, inferencias e hipótesis, y declara que no contiene identidades
verificadas.

Que el aviso viaje **dentro** del informe y no en la documentación es la
decisión relevante: un informe se exporta, se reenvía y se lee fuera de
contexto. El aviso viaja con él.

---

## 13. Conectores: `src/services/intelligence-connectors.js`

### `RateLimiter` — cubo de fichas por ventana

Se rellena al pasar 60 segundos desde el inicio de la ventana. `tryConsume()`
devuelve `false` cuando se agotan, y `BaseConnector.run` lo convierte en un
error `RATE_LIMITED` (429) **sin llamar a la fuente**.

### `isRetryable(error)` — qué merece un reintento

Un rechazo por allowlist, por endpoint remoto, por credenciales, por protocolo,
por URL inválida o por límite de ritmo **no** se reintenta: reintentar un
rechazo por política no lo convierte en aceptación, solo gasta tiempo y llama la
atención de la fuente. Todo lo demás sí, porque puede ser transitorio.

### `withRetry` — espera exponencial

`baseDelayMs * 2 ** (attempt - 1)`: 150 ms, 300 ms, 600 ms con 3 intentos por
defecto. La función de espera es inyectable (`sleep`), lo que permite probar los
reintentos sin esperar de verdad.

### `BaseConnector.run(operation)` — el envoltorio común

Un solo método concentra: comprobación de ritmo, contador de peticiones,
reintentos, medición de latencia, marca de último éxito y captura del último
error truncado a 200 caracteres. Cualquier conector nuevo hereda todo eso
gratis, y `describe()` expone las métricas por
`GET /api/v1/intelligence/connectors` para que el operador **vea** si su fuente
está sana en vez de suponerlo.

`describe()` incluye siempre `readOnly: true`, `canSign: false`,
`canBroadcast: false`. No son campos calculados: son la declaración de que la
interfaz no tiene esas operaciones.

---

## 14. Almacén cifrado: `src/infrastructure/encrypted-store.js`

### `EncryptedFileStore.save(nextState)` — escritura atómica

~~~js
await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
const envelope = encryptJson(nextState, this.key);
const temporaryPath = this.filePath + "." + process.pid + ".tmp";
await fs.writeFile(temporaryPath, JSON.stringify(envelope, null, 2), { encoding: "utf8", mode: 0o600 });
await fs.rename(temporaryPath, this.filePath);
~~~

Cuatro decisiones en cinco líneas:

1. **Directorio `0700` y archivo `0600`.** Solo el propietario. En Windows los
   modos POSIX tienen efecto limitado —**requiere validación** para ese sistema—.
2. **Cifrar antes de escribir.** El texto plano nunca llega al disco.
3. **Archivo temporal con el PID.** Dos procesos no colisionan en el temporal.
4. **`rename` como último paso.** En el mismo sistema de archivos es atómico:
   el archivo de estado nunca queda a medias. Si el proceso muere durante la
   escritura, queda el estado anterior íntegro más un `.tmp` huérfano.

### `load()` — el único error que se traga

~~~js
catch (error) {
  if (error.code === "ENOENT") return structuredClone(this.initialState);
  throw error;
}
~~~

Solo «el archivo no existe» se convierte en «empieza de cero». Un error de
descifrado, un JSON corrupto o un fallo de permisos **se propagan** y detienen
el arranque. Es lo correcto: arrancar con estado vacío tras un fallo de
descifrado equivaldría a borrar silenciosamente el inventario del operador.

### `MemoryStore` y `structuredClone`

Clona **en ambas direcciones**, al cargar y al guardar. Sin eso, el llamante
tendría una referencia viva al estado interno y podría mutarlo sin pasar por
`save`, con lo que el modo demostración se comportaría distinto del persistente
—y las pruebas dejarían de significar lo mismo.

---

## 15. Auditoría: `src/infrastructure/audit-log.js`

### `canonicalize` — por qué ordenar las claves

~~~js
Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
~~~

`JSON.stringify` conserva el orden de inserción. Sin canonicalizar, el mismo
contenido escrito con las claves en otro orden produciría otro hash y la
verificación fallaría sin que nadie hubiera manipulado nada.

### `appendAuditEntry` — la cadena

Cada entrada guarda el `hash` de la anterior en `previousHash` (o `"GENESIS"`),
y su propio `hash` se calcula sobre la entrada **incluido** ese `previousHash`.
Consecuencia: alterar una entrada intermedia invalida esa entrada y todas las
posteriores.

**Qué garantiza y qué no.** Detecta **modificación** y **eliminación
intermedia**. **No** detecta el truncado del final: quitar las últimas N
entradas deja una cadena perfectamente válida y más corta. Y quien tenga acceso
de escritura al archivo y la clave puede reconstruir la cadena entera. Es un
detector de manipulación accidental o poco sofisticada, no una prueba
criptográfica frente a un adversario con acceso local. Registrado en
[15 · Riesgos](15-risks-and-technical-debt.md) y coherente con lo que declara
[`../THREAT_MODEL.md`](../THREAT_MODEL.md).

### La redacción es parte del apéndice

`appendAuditEntry` llama a `redactForAudit(input.metadata)` **antes** de
hashear. La metadata redactada es la que se guarda y la que se firma: no hay una
versión sin redactar en ninguna parte.

---

## 16. Cliente EVM: `src/infrastructure/evm-rpc.js`

### `validateEndpoint` — cuatro rechazos, en el constructor

Se ejecuta al construir `EvmRpcClient`, no al llamar. Un endpoint inválido
impide arrancar la aplicación:

1. URL no parseable → `EVM_RPC_URL_INVALID`.
2. Protocolo distinto de http/https → `EVM_RPC_PROTOCOL_REJECTED`.
3. Usuario o contraseña embebidos → `EVM_RPC_CREDENTIALS_REJECTED`. Una URL con
   credenciales acabaría en registros y en mensajes de error.
4. Host no loopback sin `EVM_ALLOW_REMOTE_RPC` → `EVM_RPC_REMOTE_REJECTED`.

### `call(method, params)` — la allowlist como primera línea

~~~js
if (!READ_ONLY_METHODS.has(method)) {
  throw rpcError("EVM RPC method rejected by the read-only allowlist.", "EVM_RPC_METHOD_REJECTED");
}
~~~

Lista blanca, no lista negra. Un método nuevo no está permitido por omisión.
`scripts/check-security-claims.js` comprueba tanto que la lista no contenga
métodos capaces de mutar estado como que **no haya perdido** los que necesita, y
además ejercita la función real —no solo la constante.

### `readLimitedBody` — cortar antes de materializar

Comprueba `content-length` si viene, y si no, lee el `ReadableStream` por trozos
acumulando el tamaño y cancelando en cuanto se pasa. Motivo: un nodo malicioso o
averiado podría devolver una respuesta enorme; leerla entera y luego comprobar
su tamaño ya habría consumido la memoria.

### `parseQuantity` — el rango seguro

Convierte el hexadecimal a `BigInt` y rechaza por encima de
`Number.MAX_SAFE_INTEGER` antes de pasarlo a `Number`. Sin esa comprobación, un
número de bloque absurdo se convertiría silenciosamente en un valor impreciso.

---

## 17. Panel: `src/web/static/app.js`

### Modelo y renderizado

Estado local en un objeto `model` con `summary`, `controls`, `intelligence`,
`filter` y `selectedIncidentId`. `reload()` pide los datos y `render()` vuelca
el modelo al DOM. No hay framework, no hay estado reactivo: la actualización es
explícita.

### `escapeHtml` — la defensa contra XSS, aplicada sin excepción

~~~js
String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
~~~

El panel construye HTML por plantillas de cadena e inserta con `innerHTML`. Eso
solo es seguro porque **todo** dato que viene del servidor pasa por
`escapeHtml`. Es la regla más importante que hay que respetar al tocar este
archivo: una plantilla nueva que interpole un valor sin escapar abre un XSS
—aunque los datos sean locales, un nombre de proyecto o una etiqueta de registro
son entrada del usuario.

La CSP `script-src 'self'` sin `unsafe-inline` es la segunda barrera:
`scripts/check-local-only.js` verifica que no se relaje.

### `api(path, options)` — la cabecera de mutación, en un solo sitio

Añade `x-rootcause-request: 1` de forma centralizada. Es lo que hace que el
panel funcione y que un formulario ajeno no.

### Navegación por `hash`

`switchView` y el escucha de `hashchange` implementan la navegación entre las
cinco vistas sin router y sin recargar. Las URL quedan compartibles dentro de la
propia máquina.

### Service Worker

`src/web/static/sw.js` cachea los estáticos y **descarta explícitamente** todo lo
que empiece por `/api/`:

~~~js
if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
~~~

Sin esa condición, una respuesta con el inventario completo quedaría en la caché
del navegador y podría servirse obsoleta. La estrategia para los estáticos es
*network-first con respaldo en caché*: la aplicación sigue abriendo si el
proceso no está corriendo, pero muestra la última versión conocida.

---

## 18. Datasets: `src/services/intelligence-datasets.js`

### La defensa contra *path traversal*, en dos capas

~~~js
const DATASET_ID = /^[0-9a-z][0-9a-z-]{2,60}$/;
…
if (path.relative(DATASET_DIRECTORY, target).includes("..")) {
  throw rejected("datasetId resolved outside the dataset directory.", "DATASET_PATH_REJECTED");
}
~~~

La primera capa —un patrón que no admite punto ni barra— ya lo impide. La
segunda comprueba el resultado. El comentario del código lo llama «defensa en
profundidad», y es el patrón correcto para el único punto del sistema donde una
entrada del usuario participa en construir una ruta de archivo.
`scripts/check-security-claims.js` lo ejercita en caliente («el cargador de
datasets rechaza el path traversal»).

### `ingestDataset` — el orden importa

Primero los registros locales (contratos marcados, drainers, puentes), después
los exploits, y **al final** las transacciones. Motivo: los detectores
`INT-EXPO-*` e `INT-EXPLOIT-001` consultan esos registros. Ingerir las
transacciones primero produciría un análisis sin el contexto que el escenario
declara.

---

## 19. Estado de demostración: `src/services/demo-state.js`

Construye **nueve escenarios**, documentados en el propio archivo: uno por cada
una de las ocho reglas de wallet más una cuenta sana sin incidentes. Es lo que
permite que exista esta prueba:

> `demo state produces every wallet rule exactly once and a healthy account`

Esa prueba es más valiosa de lo que parece: verifica a la vez que el estado de
demostración cubre todas las reglas y que **ninguna regla dispara donde no
debería**. Una regla nueva sin escenario, o un escenario que dispare de más,
hace fallar la suite.

Todas las direcciones y hashes son ficticios y se generan por patrón
(`demoHash(seed)` repite un carácter). No hay ninguna dirección real.

---

## 20. Watchtower: `src/services/watchtower.js`

Cuarenta líneas con tres decisiones:

1. **Guarda de reentrada.** `if (this.running) return;` — si el ciclo anterior
   sigue en marcha, el nuevo se descarta. Sin esto, un RPC lento acumularía
   ciclos solapados.
2. **`timer.unref()`.** El temporizador no impide que el proceso termine.
3. **Un ciclo inmediato al arrancar** (`void this.tick()`): no se espera el
   primer intervalo para tener datos.

Los errores se registran como `watchtower_tick_failed` y **nunca** derriban el
proceso: un RPC caído no debe apagar la consola.

---

## Documentos relacionados

- [04 · Mapa del código](04-code-map.md)
- [05 · Referencia técnica](05-technical-reference.md)
- [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md)
- [18 · Guía para un nuevo desarrollador](18-new-developer-guide.md)
<!-- navegacion -->
---

**[← 05 · Referencia técnica](05-technical-reference.md)** · **[Índice](README.md)** · **[07 · Persistencia y modelo de almacenamiento →](07-database.md)**
