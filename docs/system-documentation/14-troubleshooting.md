# 14 · Solución de problemas

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

Guía práctica de diagnóstico. La guía de usuario del proyecto está en
[`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md); esta añade el diagnóstico
desde el código, con el módulo responsable de cada mensaje.

**Formato de cada entrada:** síntoma · causa posible · cómo diagnosticarlo ·
solución · módulo relacionado · riesgo de la solución.

---

## Instalación y arranque

### La ventana de consola se abre y se cierra al instante

- **Causa posible:** el proceso falló al arrancar y el mensaje se perdió con la
  ventana.
- **Diagnóstico:** abrir una consola y ejecutar el lanzador desde ella, o
  `node src/server.js` desde el código fuente. El error se imprime como
  `{"level":"fatal","event":"startup_failed", …}`.
- **Solución:** depende del mensaje. Las causas habituales son la clave de datos
  ausente, el puerto ocupado o una `EVM_RPC_URL` inválida.
- **Módulo:** `src/server.js`, bloque final.
- **Riesgo:** ninguno.

### `ROOTCAUSE_DATA_KEY is required when DEMO_MODE=false`

- **Causa:** modo persistente sin clave de cifrado.
- **Diagnóstico:** el mensaje es inequívoco. Lo emite `assertProductionConfig`
  antes de tocar disco.
- **Solución:** `node scripts/generate-key.js` y poner el valor en el entorno.
- **Módulo:** `src/config.js`.
- **Riesgo de la solución:** **alto si se hace mal.** Generar una clave **nueva**
  cuando ya existía un estado cifrado no lo recupera: el archivo antiguo queda
  ilegible para siempre. Antes de generar, comprobar si ya había una clave.

### `EADDRINUSE` al arrancar

- **Causa:** el puerto 8790 está ocupado, con frecuencia por otra instancia de la
  propia aplicación.
- **Diagnóstico (Windows):**

  ~~~powershell
  Get-NetTCPConnection -LocalPort 8790 -ErrorAction SilentlyContinue
  ~~~

- **Solución:** cerrar la otra instancia, o arrancar con `PORT=8791`. `PORT=0`
  pide un puerto efímero.
- **Módulo:** `startServer` en `src/server.js`.
- **Riesgo:** **importante.** Si la otra instancia apunta al mismo `DATA_DIR`, no
  hay bloqueo de archivo y las dos pueden pisarse las escrituras. Es preferible
  cerrar la otra instancia a cambiar el puerto.

### `EVM_RPC_URL must be a valid URL` o `Remote EVM RPC is disabled`

- **Causa:** el endpoint no supera la validación, que se ejecuta **en el
  constructor** y por tanto impide el arranque.
- **Diagnóstico:** el `code` del error distingue el motivo:
  `EVM_RPC_URL_INVALID`, `EVM_RPC_PROTOCOL_REJECTED`,
  `EVM_RPC_CREDENTIALS_REJECTED`, `EVM_RPC_REMOTE_REJECTED`.
- **Solución:** corregir la URL. Si es remota a propósito, `EVM_ALLOW_REMOTE_RPC=true`.
- **Módulo:** `validateEndpoint` en `src/infrastructure/evm-rpc.js`.
- **Riesgo de la solución:** activar el RPC remoto significa que el proveedor ve
  **qué contratos y direcciones se están vigilando**. Es una decisión de
  privacidad, no de conectividad.

### `Credentials embedded in EVM_RPC_URL are rejected`

- **Causa:** la URL lleva usuario y contraseña.
- **Solución:** usar un nodo sin autenticación en loopback, o poner un proxy
  local que añada la credencial.
- **Riesgo de saltárselo:** no hay forma de saltárselo, y es deliberado: una URL
  con credenciales acaba en registros y mensajes de error.

### Corepack no puede descargar pnpm

- **Causa:** sin red o con un proxy corporativo.
- **Solución:** usar `node` directamente. **Ningún script del repositorio
  necesita pnpm**: los comandos de `package.json` son envoltorios de `node`.
- **Riesgo:** ninguno.

---

## El panel arranca pero está vacío

### No hay proyectos ni incidentes

- **Causa 1:** modo persistente con estado nuevo. Es lo esperado.
- **Causa 2:** modo demostración que no cargó.
- **Diagnóstico:**

  ~~~bash
  curl -s http://127.0.0.1:8790/api/health
  ~~~

  El campo `mode` de `/api/summary` dice `demo` o `persistent`.
- **Solución:** registrar el inventario con `POST /api/projects`, o sembrar un
  estado cifrado con `node scripts/seed-demo.js`.
- **Módulo:** `buildRuntime` en `src/server.js`.
- **Riesgo:** `seed-demo.js` **se niega a sobrescribir** un estado existente, así
  que es seguro ejecutarlo por error.

### La aplicación instalada arranca sin contenido

- **Causa:** el empaquetado no incluyó `config/` o `src/`.
- **Diagnóstico:** comprobar que la carpeta descomprimida contiene `config/`,
  `src/` y `runtime/node.exe`. Y luego:

  ~~~bash
  curl -s http://127.0.0.1:8790/api/summary
  ~~~

  Si `totals.projects` es 0 en modo demostración, el contenido no viajó dentro.
- **Solución:** volver a empaquetar. El job `app-windows` de CI comprueba
  exactamente esto en cada cambio, así que un artefacto publicado no debería
  tener el problema.
- **Módulo:** `packaging/windows/build-portable.ps1`.

---

## El observador no conecta

### `BLK-NODE-001` · Observador RPC no disponible

- **Causa:** el nodo no responde, o el timeout es demasiado corto.
- **Diagnóstico:** el propio incidente lleva el mensaje del error en
  `explanation` y el endpoint en `evidence`. Comprobación directa:

  ~~~bash
  curl -s -X POST http://127.0.0.1:8545 -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
  ~~~

- **Solución:** arrancar el nodo, o subir `EVM_RPC_TIMEOUT_MS`.
- **Módulo:** `refreshNode` en `src/services/defense-service.js`; `evaluateNode`
  en `src/domain/rule-engine.js`.
- **Riesgo:** subir mucho el timeout retiene peticiones HTTP y alarga los ciclos
  del watchtower.

### `BLK-NODE-002` · RPC conectado a la red equivocada

- **Causa:** `EVM_EXPECTED_CHAIN_ID` no coincide con el `eth_chainId` observado.
- **Diagnóstico:** el incidente muestra ambos valores en `evidence`.
- **Solución:** corregir la variable, o apuntar al nodo correcto.
- **Riesgo:** **es un incidente crítico por una buena razón.** Antes de cambiar
  la variable para «callarlo», verificar cuál de los dos valores está mal: puede
  ser el nodo el que apunta a otra red, y en ese caso todas las decisiones
  tomadas con esos datos son inválidas.

### `BLK-NODE-003` · Observador atrasado

- **Causa:** el nodo va más de `maximumObserverLagBlocks` (8) por detrás.
- **Diagnóstico:** el incidente muestra `blockNumber`,
  `latestObservedBlockNumber` y `lagBlocks`.
- **Solución:** revisar la sincronización del nodo.
- **Riesgo:** subir el umbral esconde el problema en lugar de resolverlo.

---

## La API rechaza mis peticiones

### 403 `MUTATION_HEADER_REQUIRED`

- **Causa:** falta `x-rootcause-request: 1` en un POST, PUT, PATCH o DELETE.
- **Solución:** añadir la cabecera.
- **Módulo:** `validateMutationRequest` en `src/app.js`.
- **Riesgo:** ninguno. No es una credencial: es una barrera anti-CSRF que un
  cliente legítimo añade sin problema.

### 403 `CROSS_SITE_REQUEST_REJECTED`

- **Causa:** el navegador envió `sec-fetch-site` con un valor cross-site.
- **Diagnóstico:** ocurre cuando se llama a la API desde una página servida por
  otro origen.
- **Solución:** usar el panel de la propia aplicación, o un cliente que no sea un
  navegador.

### 415 o 413

- **415:** falta `content-type: application/json`.
- **413:** el cuerpo supera `REQUEST_BODY_LIMIT_BYTES` (128 KB por defecto). Es
  fácil de alcanzar con un inventario grande o un lote de transacciones.
- **Solución del 413:** dividir el lote, o subir el límite hasta 1 MB.
- **Riesgo:** subirlo amplía la memoria que una petición puede forzar antes de
  ser rechazada.

### 422 `SECRET_MATERIAL_REJECTED`

- **Causa:** la petición contiene un campo con nombre prohibido o un valor que
  coincide con un patrón de material privado.
- **Diagnóstico:** el mensaje indica **la ruta exacta** del campo, por ejemplo
  `Forbidden secret field rejected at request.contracts[0].privateKey`.
- **Solución:** quitar el campo. **No** hay forma de desactivar la comprobación,
  y es la característica central del producto.
- **Módulo:** `assertNoSecretMaterial` en `src/domain/secret-guard.js`.
- **Nota:** el rechazo puede ser un falso positivo si el campo se llama, por
  ejemplo, `seedRound` —`compactKey` busca por inclusión y `seed` está en la
  lista—. Si ocurre, renombrar el campo es la solución correcta.

### 429 `RATE_LIMITED`

- **Causa:** más de `RATE_LIMIT_PER_MINUTE` peticiones en un minuto desde el
  mismo origen.
- **Solución:** espaciar las peticiones, o subir el límite.
- **Nota:** el panel hace varias peticiones por recarga; con el límite muy bajo
  se puede alcanzar en uso normal.

### 400 `ADDRESS_INVALID` en una dirección Bitcoin que parece correcta

- **Causa:** **el checksum no valida.** El sistema no comprueba la forma: verifica
  el checksum de verdad.
- **Diagnóstico:** copiar la dirección de una fuente autoritativa. Un error de
  transcripción de un solo carácter produce este error, que es exactamente para lo
  que sirve el checksum.
- **Módulo:** `normalizeAddress` en `src/domain/intelligence/model.js`.
- **Riesgo de «arreglarlo»:** relajar esa validación permitiría meter en el grafo
  direcciones que no existen.

### 404 en una ruta de `/api/v1` que existe en la documentación

- **Causa 1:** el parámetro no cumple el patrón —red `[a-z]{3,20}`, dirección
  `[A-Za-z0-9]{20,128}`, identificador `[a-z]+-[a-f0-9]{20}`—.
- **Causa 2:** el método HTTP no coincide.
- **Diagnóstico:** el router recorre las rutas comparando **método y patrón**; si
  ninguna coincide devuelve `null` y el router de defensa responde 404.
- **Solución:** revisar método y forma de los parámetros.

---

## Problemas de detección

### Un incidente que ya corregí sigue apareciendo

- **Causa:** el hallazgo se recalcula desde el estado. Si el evento correctivo no
  se ha observado, la condición sigue vigente.
- **Diagnóstico:** revisar la `evidence` del incidente: dice qué evento lo
  sostiene.
- **Solución:** enviar el evento correctivo —por ejemplo, la revocación con
  `amountRaw: "0"`— y ejecutar `POST /api/scan`. `mergeIncidents` lo marcará
  `resolved` automáticamente.
- **Riesgo:** marcarlo `resolved` a mano **no funciona**: el siguiente análisis
  lo devuelve a `open`, porque la condición sigue ahí. Eso es correcto.

### Un incidente desapareció sin que nadie lo tocara

- **Causa:** su hallazgo dejó de detectarse y `mergeIncidents` lo resolvió.
- **Diagnóstico:** sigue en `GET /api/incidents` con `status: "resolved"` y
  `resolvedAt`, sin `resolvedBy`.
- **Nota:** es el comportamiento previsto. Si ocurre con frecuencia y luego
  reaparece, hay un umbral mal calibrado o un colector intermitente.

### Demasiados `BLK-WALLET-008` por «red no autorizada»

- **Causa:** `wallet.allowedChainIds` trae `["1", "11155111"]` por defecto.
- **Solución:** ajustar la lista en `config/policies.json` y **reiniciar**.
- **Riesgo:** añadir una red que la organización no usa de verdad desactiva una
  detección legítima.

### Un indicador `INT-*` no se activa cuando debería

- **Diagnóstico en tres pasos:**
  1. ¿Hay transacciones activas? `GET /api/v1/intelligence/summary` →
     `transactions` y `orphanedTransactions`.
  2. ¿Se ejecutó el análisis después de la ingesta?
     `POST /api/v1/intelligence/analyze`.
  3. ¿El umbral es alcanzable con los datos? Los umbrales están en
     `config/intelligence-policies.json` y el indicador emitido incluye
     `thresholdsApplied`.
- **Causa frecuente:** las transacciones quedaron **huérfanas** por una
  reorganización y `activeTransactions()` las excluye.

### El grafo devuelve menos de lo esperado

- **Causa:** se alcanzó una cota.
- **Diagnóstico:** la respuesta incluye `truncated: true` y
  `truncationReasons` con `max-nodes`, `max-edges` o `max-depth`.
- **Solución:** subir los parámetros —hasta el máximo compilado— o filtrar por
  activo, monto mínimo o ventana temporal para reducir el espacio.
- **Nota:** `bound()` acota en silencio. Pedir `depth=999` **no es un error**:
  devuelve 6.

### La cadena de auditoría aparece rota

- **Diagnóstico:** `GET /api/audit` devuelve `{valid: false, brokenAt, reason}`
  con `reason` en `previous_hash_mismatch` o `entry_hash_mismatch`.
- **Causa 1:** el archivo de estado fue editado fuera de la aplicación.
- **Causa 2:** dos procesos escribieron sobre el mismo `DATA_DIR`.
- **Solución:** restaurar el respaldo. **No hay reparación**: reconstruir la
  cadena destruiría precisamente la propiedad que la hace útil.
- **Riesgo:** tratar esto como un fallo cosmético. Una cadena rota es la señal de
  que el estado no es de fiar.

---

## Problemas de desarrollo

### `pnpm check` falla en `check:security`

- **Causa:** un invariante de seguridad se rompió.
- **Diagnóstico:** el script lista **cada** comprobación con `ok` o el fallo. Se
  puede ejecutar aislado:

  ~~~bash
  node scripts/check-security-claims.js
  ~~~

- **Riesgo de «arreglarlo» tocando el gate:** el gate **es** la especificación de
  seguridad. Si falla, lo que hay que corregir es el código, no la comprobación.

### `check:docs` falla tras renombrar un documento

- **Causa:** algún Markdown enlaza o menciona una ruta que ya no existe.
- **Diagnóstico:** el script imprime el documento y la ruta rota.
- **Nota importante para quien escriba documentación:** el script comprueba
  **dos** cosas: los enlaces Markdown, y también las **rutas escritas en texto**
  que empiecen por `docs/`, `config/`, `src/`, `scripts/`, `test/`, `examples/` o
  `packaging/` y terminen con una extensión de hasta 6 caracteres. Mencionar una
  ruta inexistente en prosa rompe el gate igual que un enlace roto.

### `check:rules` falla tras tocar el motor

- **Causa:** un código nuevo no llegó al catálogo, a la política o al README; o
  al revés.
- **Solución:** actualizar los cuatro sitios. El gate dice exactamente cuál falta.
- **Nota:** si el código se emite desde más de un punto a propósito, hay que
  añadirlo a `MULTI_EMITTERS` en `scripts/check-rule-coverage.js`, como está
  `BLK-WALLET-008`.

### `check:local-only` falla al añadir una herramienta

- **Causa:** se añadió una dependencia, aunque fuera de desarrollo.
- **Nota:** la cabecera del propio script lo dice: «una dependencia de
  construcción es una dependencia». La alternativa que el repositorio adopta es
  escribir la herramienta a mano —como `scripts/lib/markdown.js`— o usar algo ya
  instalado en el sistema por un protocolo estándar —como el navegador para los
  PDF.

### Un archivo fuente aparece como binario en `git diff`

- **Causa confirmada:** `src/domain/intelligence/model.js` y
  `src/services/intelligence-service.js` contienen un **byte nulo literal**
  dentro de una expresión regular de caracteres de control. Git lo detecta y
  marca el archivo como binario.
- **Diagnóstico:**

  ~~~bash
  git grep -I --name-only "" -- "src/**/*.js"
  ~~~

  Los archivos que faltan en esa lista son los binarios para git.
- **Solución:** sustituir los bytes literales por sus escapes
  (`\u0000` y `\u001f`), como ya hace `src/services/defense-service.js`. El
  comportamiento de la expresión regular no cambia.
- **Riesgo:** ninguno funcional. **No se aplicó en este análisis** porque la
  instrucción de trabajo era documentar sin modificar el comportamiento; queda
  registrado en [15 · Riesgos](15-risks-and-technical-debt.md).

### La generación de PDF de la documentación falla

- **Causa 1:** no hay Chrome ni Edge instalado. El mensaje lo dice.
- **Causa 2:** `ROOTCAUSE_CHROME` apunta a un ejecutable que no existe. El error
  es explícito y se lanza de inmediato.
- **Causa 3:** «el navegador no publicó su puerto de depuración en 20 s», que
  suele significar un perfil bloqueado o una política corporativa que impide el
  modo headless.
- **Solución:** instalar un navegador basado en Chromium o indicar su ruta.
- **Nota:** los Markdown son la fuente. Que no se puedan generar los PDF no
  impide leer la documentación.

---

## Comandos de diagnóstico rápido

~~~bash
node --version
~~~

~~~bash
curl -s http://127.0.0.1:8790/api/health
~~~

~~~bash
curl -s http://127.0.0.1:8790/api/summary
~~~

~~~bash
curl -s http://127.0.0.1:8790/api/audit
~~~

~~~bash
curl -s http://127.0.0.1:8790/api/v1/intelligence/summary
~~~

~~~bash
curl -s http://127.0.0.1:8790/api/v1/intelligence/connectors
~~~

~~~bash
pnpm check
~~~

---

## Dónde reportar

Ver [`../../SECURITY.md`](../../SECURITY.md) para vulnerabilidades y
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) para el resto.

---

## Documentos relacionados

- [10 · Configuración](10-configuration.md)
- [13 · Despliegue y operación](13-deployment-and-operations.md)
- [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md)
- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md)
- [`../RUNBOOK.md`](../RUNBOOK.md)
<!-- navegacion -->
---

**[← 13 · Despliegue y operación](13-deployment-and-operations.md)** · **[Índice](README.md)** · **[15 · Riesgos y deuda técnica →](15-risks-and-technical-debt.md)**
