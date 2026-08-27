# 15 · Riesgos y deuda técnica

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

> **Este documento es informativo.** Ningún hallazgo se corrigió durante el
> análisis: la instrucción de trabajo era documentar sin modificar el
> comportamiento del sistema. Cada entrada incluye su evidencia y una
> recomendación, para que la decisión de actuar sea del mantenedor.

## Cómo leer esta tabla

| Campo | Escala |
|---|---|
| **Severidad** | Crítica · Alta · Media · Baja |
| **Impacto** | Qué ocurre si el riesgo se materializa |
| **Probabilidad** | Alta · Media · Baja, en el modo de uso previsto (escritorio, loopback) |
| **Evidencia** | Archivo y símbolo verificables |
| **Prioridad** | P1 (antes de datos reales) · P2 (próxima versión) · P3 (cuando haya capacidad) |

## Resumen

| Severidad | Cantidad |
|---|---|
| Crítica | 0 |
| Alta | 6 |
| Media | 10 |
| Baja | 9 |
| **Total** | **25** |

**Valoración general.** No se encontró ningún defecto que comprometa las
promesas centrales del producto —no custodiar claves, no firmar, no salir a
Internet—: esas están respaldadas por 51 invariantes ejecutables que se
comprobaron en caliente y pasaron. Los hallazgos de severidad alta son huecos
operativos y de escala, no fallos de seguridad del núcleo.

---

## Severidad alta

### R-01 · El sistema no detecta que un colector dejó de enviar

- **Severidad:** Alta · **Impacto:** Alto · **Probabilidad:** Alta ·
  **Prioridad:** P1
- **Descripción:** el sistema vigila su observador RPC —`BLK-NODE-001/002/003`—
  pero **no vigila a los colectores**. Si un colector de eventos wallet deja de
  enviar, no se emite ningún hallazgo.
- **Impacto:** un panel en verde puede significar «todo bien» o «nadie está
  mirando», y **desde dentro del sistema no hay forma de distinguirlo**. Es la
  peor clase de falso negativo: uno que además tranquiliza.
- **Evidencia:** no existe ninguna regla en `src/domain/rule-engine.js` ni en
  `src/domain/wallet-rules.js` que evalúe la antigüedad del último evento
  recibido por cuenta o por origen.
- **Recomendación:** una regla `BLK-*` nueva, por ejemplo «cuenta vigilada sin
  eventos desde hace más de N días», con su umbral en la política. Encaja
  perfectamente en el modelo existente y reutiliza todo el ciclo de vida de
  incidentes.

### R-02 · Sin bloqueo entre procesos sobre el estado

- **Severidad:** Alta · **Impacto:** Alto · **Probabilidad:** Media ·
  **Prioridad:** P1
- **Descripción:** `DefenseService.writeQueue` serializa las escrituras **dentro
  del proceso**. Dos procesos apuntando al mismo `DATA_DIR` no se coordinan.
- **Impacto:** pérdida silenciosa de cambios, y potencialmente una cadena de
  auditoría rota —que es el síntoma visible—.
- **Evidencia:** `DefenseService.mutate` en `src/services/defense-service.js`;
  `EncryptedFileStore.save` en `src/infrastructure/encrypted-store.js` no toma
  ningún bloqueo.
- **Escenario real:** el usuario arranca el lanzador dos veces, o deja una
  instancia de desarrollo abierta y arranca la empaquetada.
- **Recomendación:** un archivo de bloqueo con el PID en `DATA_DIR`, comprobado
  al arrancar. Un aviso claro es mejor que una corrupción silenciosa.

### R-03 · La ausencia de respaldo y de rotación de clave no está resuelta

- **Severidad:** Alta · **Impacto:** Muy alto · **Probabilidad:** Media ·
  **Prioridad:** P1
- **Descripción:** perder `ROOTCAUSE_DATA_KEY` hace el estado **irrecuperable**.
  No hay procedimiento de respaldo documentado ni utilidad de rotación.
- **Impacto:** pérdida total del inventario, del historial de incidentes y de la
  cadena de auditoría.
- **Evidencia:** `scripts/generate-key.js` avisa en `stderr`, pero es el único
  control. No hay script de respaldo ni de recifrado en `scripts/`.
- **Recomendación:** (a) documentar el procedimiento de respaldo y restauración;
  (b) añadir una utilidad de rotación en `scripts/` que descifre con la clave
  antigua y recifre con la nueva.

### R-04 · Reconstrucción del grafo en cada consulta

- **Severidad:** Alta · **Impacto:** Medio · **Probabilidad:** Alta ·
  **Prioridad:** P2
- **Descripción:** `buildFundsGraph` se ejecuta entero en cada `assess()`,
  `graph()`, `paths()`, `cycles()` y `communities()`.
- **Impacto:** con la cota de 20 000 transacciones, cada evaluación de riesgo
  recorre todas las transferencias y ordena todas las listas de adyacencia. El
  panel llama a `assess()` en cada búsqueda de dirección.
- **Evidencia:** `IntelligenceService.assess`, `graph`, `paths`, `cycles`,
  `communities` en `src/services/intelligence-service.js`: todos empiezan con
  `buildFundsGraph(this.activeTransactions(intelligence))`.
- **Nota:** la ausencia de caché es una decisión defendible —nunca hay una vista
  derivada obsoleta— y `config/intelligence-policies.json` ya prevé
  `assessmentCacheSeconds`.
- **Recomendación:** memorizar el grafo invalidándolo al ingerir. Medir antes de
  optimizar: puede no ser un problema real con los volúmenes esperados.

### R-05 · Búsqueda lineal de duplicados en cada evento wallet

- **Severidad:** Alta · **Impacto:** Medio · **Probabilidad:** Media ·
  **Prioridad:** P2
- **Descripción:** `observeWalletEvent` recorre **todos** los eventos existentes
  para detectar un duplicado, y lo hace dentro de la cola de escritura.
- **Impacto:** el coste de ingerir N eventos es cuadrático. Con decenas de miles
  de eventos, un colector activo degrada notablemente el sistema.
- **Evidencia:** `state.walletEvents.find(...)` en
  `src/services/defense-service.js`.
- **Recomendación:** un índice `Set` de claves `(chainId, txHash, logIndex)`
  mantenido en memoria por el servicio, o una cota de retención para
  `walletEvents` como la que ya tiene el bloque de inteligencia —hoy **no tiene
  ninguna**.

### R-06 · `walletEvents` y `observedEvents` crecen sin cota

- **Severidad:** Alta · **Impacto:** Medio · **Probabilidad:** Media ·
  **Prioridad:** P2
- **Descripción:** el bloque de inteligencia tiene `LIMITS` para transacciones,
  bloques, indicadores, alertas, evidencia y casos. Los arrays del estado raíz
  —`walletEvents`, `observedEvents`, `approvals`, `incidents`, `audit`— **no
  tienen ninguna cota**.
- **Impacto:** crecimiento indefinido del archivo de estado, que se carga entero
  en memoria en cada operación.
- **Evidencia:** `LIMITS` en `src/services/intelligence-service.js`; no existe
  equivalente en `src/services/defense-service.js`.
- **Recomendación:** definir una política de retención explícita para el estado
  raíz. La auditoría merece un trato aparte: recortarla rompería la cadena, así
  que probablemente necesite archivado en lugar de recorte.

---

## Severidad media

### R-07 · Bytes nulos literales en dos archivos fuente

- **Severidad:** Media · **Impacto:** Medio · **Probabilidad:** Alta (ya ocurre)
  · **Prioridad:** P2
- **Descripción:** `src/domain/intelligence/model.js` (línea 170) y
  `src/services/intelligence-service.js` (línea 80) contienen un **byte nulo
  literal** dentro de una clase de caracteres de una expresión regular, en lugar
  del escape `\u0000`.
- **Impacto:** git detecta el byte nulo y trata los archivos como **binarios**:
  `git diff` muestra «Binary files differ» en lugar del cambio, `git grep` los
  omite, y la normalización de finales de línea de `.gitattributes`
  (`* text=auto eol=lf`) **no se les aplica**. Revisar un cambio en esos dos
  archivos —de los más importantes del repositorio— es notablemente más difícil.
- **Evidencia reproducible:**

  ~~~bash
  git grep -I --name-only "" -- "src/**/*.js"
  ~~~

  Devuelve 19 de los 24 archivos; los dos citados no aparecen.
- **Nota:** `src/services/defense-service.js` resuelve lo mismo correctamente,
  con `/[\u0000-\u001f]/`.
- **Recomendación:** sustituir los bytes literales por sus escapes. El
  comportamiento de la expresión regular **no cambia**. Es un cambio de dos
  caracteres con un beneficio de mantenimiento desproporcionado.

### R-08 · La versión de `/api/health` está escrita a mano

- **Severidad:** Media · **Impacto:** Medio · **Probabilidad:** Alta ·
  **Prioridad:** P2
- **Descripción:** `src/api/router.js` devuelve `version: "0.3.0"` como cadena
  literal, mientras la fuente de verdad es `package.json`.
- **Impacto:** al publicar `0.4.0`, el endpoint de salud seguirá diciendo `0.3.0`
  hasta que alguien recuerde cambiarlo. Un integrador que decida por esa versión
  se equivocará, y una auditoría de despliegue verá una versión falsa.
- **Evidencia:** literal en `createApiRouter`; `package.json` declara `0.3.0`.
- **Recomendación:** leer la versión de `package.json` al arrancar y pasarla por
  configuración. Alternativa mínima: un gate que compare ambas, en la línea de
  `scripts/check-rule-coverage.js`.

### R-09 · Truncado silencioso del lote de ingesta

- **Severidad:** Media · **Impacto:** Medio · **Probabilidad:** Media ·
  **Prioridad:** P2
- **Descripción:** el router recorta a 500 bloques y 5000 transacciones con
  `slice`, **sin avisar**.
- **Impacto:** un cliente que envía 6000 transacciones recibe un 202 y cree que
  se ingirieron todas. Las 1000 restantes se pierden en silencio.
- **Evidencia:** `Array.isArray(body.transactions) ? body.transactions.slice(0, 5000) : []`
  en `src/api/intelligence-router.js`.
- **Recomendación:** rechazar con 413 y un mensaje explícito, o devolver en el
  `run` cuántos elementos se descartaron. El propio repositorio enuncia el
  principio en el diseño de las respuestas del grafo: cuando se trunca, hay que
  decirlo.

### R-10 · Recorte silencioso por cota de retención

- **Severidad:** Media · **Impacto:** Medio · **Probabilidad:** Media ·
  **Prioridad:** P3
- **Descripción:** al superar `LIMITS`, `ingest` descarta las entradas más
  antiguas sin registro ni aviso.
- **Impacto:** un análisis posterior se ejecuta sobre menos datos de los que el
  operador cree, y `dataScope.transactionsAnalyzed` no distingue «no había más»
  de «se descartaron».
- **Evidencia:** los dos bloques de `slice(-LIMITS.…)` en
  `IntelligenceService.ingest`.
- **Recomendación:** una entrada de auditoría al recortar, y un contador en el
  `run`.

### R-11 · Sin aviso al exponer fuera de loopback

- **Severidad:** Media · **Impacto:** Alto · **Probabilidad:** Baja ·
  **Prioridad:** P2
- **Descripción:** arrancar con `HOST=0.0.0.0` publica una API **sin
  autenticación** y el sistema no lo advierte de forma destacada.
- **Impacto:** cualquiera que alcance el puerto puede leer el inventario
  completo, registrar proyectos y aprobar hashes de cambio.
- **Evidencia:** `loadConfig` acepta cualquier `HOST`; el registro de arranque
  imprime la dirección pero no la califica de riesgo.
- **Recomendación:** un aviso explícito en `stderr` al arrancar con un bind no
  loopback, recordando que no hay autenticación. El código ya distingue loopback
  en `openBrowserIfRequested`: la comprobación existe y se puede reutilizar.

### R-12 · Sin aviso al usar RPC remoto

- **Severidad:** Media · **Impacto:** Medio · **Probabilidad:** Baja ·
  **Prioridad:** P3
- **Descripción:** con `EVM_ALLOW_REMOTE_RPC=true`, el proveedor del endpoint ve
  qué contratos y direcciones se consultan. No hay recordatorio.
- **Impacto:** filtración de la superficie vigilada a un tercero —exactamente lo
  que el producto evita por diseño en todo lo demás.
- **Recomendación:** aviso en el arranque y marca visible en el panel junto al
  estado del observador.

### R-13 · Configuración declarada y no leída

- **Severidad:** Media · **Impacto:** Bajo · **Probabilidad:** Alta ·
  **Prioridad:** P3
- **Descripción:** `config/intelligence-policies.json` declara
  `api.assessmentCacheSeconds: 60` y `api.maximumAddressesPerRequest: 25`.
  **Ninguno se lee en el código.** El estado de inteligencia declara además un
  array `assessments[]` en el que **nunca se escribe**.
- **Impacto:** un auditor que lea la configuración concluirá que existe una caché
  de 60 segundos y un endpoint de lote, y ninguna de las dos cosas existe.
- **Evidencia:** búsqueda de `assessmentCacheSeconds`,
  `maximumAddressesPerRequest` y de escrituras a `intelligence.assessments` en
  `src/`: sin resultados.
- **Recomendación:** eliminarlos, o marcarlos en el propio JSON como previstos y
  no implementados.

### R-14 · `schemaVersion` presente pero nunca comprobado

- **Severidad:** Media · **Impacto:** Medio · **Probabilidad:** Baja ·
  **Prioridad:** P3
- **Descripción:** el estado raíz declara `schemaVersion: 2` y el de inteligencia
  `schemaVersion: 1`, pero **ningún código los lee**.
- **Impacto:** si en el futuro se introduce un cambio incompatible, no hay punto
  donde detectarlo: se cargaría un estado antiguo con una interpretación nueva.
- **Evidencia:** `createEmptyState` y `createEmptyIntelligenceState`; ninguna
  comparación en `initialize` ni en `ensureState`.
- **Recomendación:** comprobarlo en `initialize` y fallar con un mensaje claro
  ante una versión superior a la soportada. `decryptJson` ya aplica esa idea con
  la versión del sobre.

### R-15 · Sin paginación en ninguna colección

- **Severidad:** Media · **Impacto:** Medio · **Probabilidad:** Media ·
  **Prioridad:** P3
- **Descripción:** `/api/incidents`, `/api/audit`, `/api/projects`,
  `/api/accounts`, las alertas y los casos se devuelven completos.
- **Impacto:** con el crecimiento sin cota de R-06, `GET /api/audit` puede llegar
  a devolver una respuesta muy grande, que además se serializa entera en memoria.
- **Nota:** `/api/summary` sí recorta a 30 incidentes, lo que hace la
  inconsistencia menos visible y por tanto más fácil de pasar por alto al
  integrar.
- **Recomendación:** parámetros `limit` y `cursor` en las colecciones que pueden
  crecer.

### R-16 · Mapa del limitador de peticiones sin purga

- **Severidad:** Media · **Impacto:** Bajo · **Probabilidad:** Baja ·
  **Prioridad:** P3
- **Descripción:** `createRateLimiter` guarda una entrada por dirección de origen
  y **nunca las elimina**.
- **Impacto:** en loopback es una entrada. Expuesto a una red, el mapa crece con
  cada dirección distinta.
- **Evidencia:** el `Map` de `createRateLimiter` en `src/app.js`.
- **Recomendación:** purga por antigüedad al comprobar, o un mapa acotado.

---

## Severidad baja

### R-17 · Módulos sin cobertura de prueba directa

- **Severidad:** Baja · **Prioridad:** P2
- `src/domain/intelligence/risk-score.js` (245 líneas): 0 pruebas dedicadas.
- `src/services/defense-service.js` (714 líneas): 0 pruebas dedicadas;
  `mergeIncidents` gobierna todo el ciclo de vida de los incidentes.
- `src/services/intelligence-connectors.js` (405 líneas): `withRetry`,
  `isRetryable` y `RateLimiter` son lógica pura sin cobertura directa, y `sleep`
  ya es inyectable.
- `src/services/watchtower.js`: sin cobertura.
- `src/web/static/app.js` (660 líneas): sin cobertura, incluida `escapeHtml`.
- **Recomendación:** la propuesta priorizada está en
  [12 · Pruebas y calidad](12-testing-and-quality.md#propuesta-priorizada-de-pruebas-faltantes).

### R-18 · Sin medición de cobertura

- **Severidad:** Baja · **Prioridad:** P3
- `.gitignore` menciona `coverage/`, pero no hay script ni job que la genere.
  Node incluye `--experimental-test-coverage`, que **no añadiría ninguna
  dependencia**.

### R-25 · `BLK-ACCESS-002` no tiene prueba ni escenario de demostración

- **Severidad:** Baja · **Impacto:** Medio · **Probabilidad:** Baja ·
  **Prioridad:** P2
- **Descripción:** de las 22 reglas, `BLK-ACCESS-002` —«umbral administrativo
  insuficiente»— es **la única sin ninguna prueba y sin ningún escenario de
  demostración** que la active.
- **Cómo se comprobó:** ejecutando `buildRuntime` en modo demostración y
  recogiendo los códigos realmente emitidos —19 de 22— y buscando el código en
  `test/`. Los otros dos que la demo no activa, `BLK-NODE-001` y
  `BLK-NODE-002`, **sí** están cubiertos por `test/rule-engine.test.js`.
- **Impacto:** la regla podría dejar de funcionar sin que ninguna puerta lo
  detecte. `scripts/check-rule-coverage.js` comprueba que el código **existe** en
  el motor, el catálogo, la política y el README, pero no que **se dispare**.
- **Recomendación:** añadir un contrato con un multisig de umbral débil al
  escenario de demostración, y una prueba en `test/rule-engine.test.js`. Es una
  tarea de incorporación excelente.

### R-19 · Código implementado y no conectado

- **Severidad:** Baja · **Prioridad:** P3

| Elemento | Archivo | Consumidores |
|---|---|---|
| `BitcoinRpcConnector` | `src/services/intelligence-connectors.js` | Ninguno: `buildRuntime` no lo registra |
| `IntelligenceService.topAlerts` | `src/services/intelligence-service.js` | Ninguno |
| `describeBand` | `src/domain/intelligence/risk-score.js` | Ninguno |
| `isValidAddress` | `src/domain/intelligence/model.js` | Solo pruebas |
| `makeWalletCluster` | `src/domain/intelligence/model.js` | Solo pruebas |

- **Impacto:** confusión al leer el código —parece que Bitcoin está conectado
  cuando no lo está— y superficie de mantenimiento sin uso.
- **Requiere validación:** cada uno puede ser una extensión prevista.
- **Recomendación:** conectarlos, o marcarlos con un comentario que diga
  explícitamente que están previstos y todavía no cableados. `makeWalletCluster`
  es un caso especial: implementa una hipótesis de agrupación que el producto
  documenta pero no expone por API.

### R-20 · El guardián de secretos no detecta una frase semilla en texto natural

- **Severidad:** Baja (por el modelo de despliegue) · **Prioridad:** P3
- **Descripción:** los cuatro patrones de contenido detectan claves extendidas,
  WIF, PEM y URL con credenciales. **Una frase semilla BIP-39 en lenguaje
  natural** dentro de un campo con nombre inocuo —`purpose`, `note`— no coincide
  con ninguno.
- **Mitigación existente:** el filtro por nombre de campo cubre `mnemonic`,
  `seed`, `seedphrase`, `recoveryphrase` y `recoverywords`; y `redactForAudit`
  trunca a 512 caracteres.
- **Recomendación:** un detector heurístico de 12 o 24 palabras consecutivas de
  la lista BIP-39 sería posible, pero exigiría incrustar la lista —2048 palabras—
  en el repositorio. **Requiere validación:** puede no compensar.

### R-21 · Sin `fsync` explícito al guardar

- **Severidad:** Baja · **Prioridad:** P3
- `fs.writeFile` seguido de `fs.rename` garantiza que el archivo nunca queda a
  medias, pero no que el contenido esté volcado a disco cuando cae la energía.
- **Recomendación:** evaluar si la durabilidad lo justifica. Para una aplicación
  de escritorio probablemente no.

### R-22 · Determinismo de `criterio de tiempo` en los detectores

- **Severidad:** Baja · **Prioridad:** P3
- Varios detectores usan `now` inyectado —bien—, pero `makeFinding` cae a
  `new Date().toISOString()` cuando el llamante no pasa `detectedAt`.
- **Impacto:** el `detectedAt` de un hallazgo puede variar entre ejecuciones
  aunque el hallazgo sea el mismo. No afecta a la identidad —el `id` no incluye
  la fecha— ni al ciclo de vida, porque `mergeIncidents` conserva `createdAt`.
- **Recomendación:** propagar siempre `context.now`, por consistencia.

### R-23 · Vocabulario de «workflows» frente a «puertas»

- **Severidad:** Baja · **Prioridad:** P3
- `../CI_GITHUB.md` y `../INDEX.md` hablan de «los cuatro workflows»; el
  encabezado de `.github/workflows/ci.yml` habla de «seis puertas». Ambas cifras
  son correctas —4 archivos de workflow, 6 jobs dentro de `ci.yml`— pero el
  vocabulario mezclado confunde al leer.
- **Recomendación:** unificar el término.

### R-24 · Política de demostración en la configuración de producción

- **Severidad:** Baja · **Prioridad:** P2
- `config/policies.json` incluye en `wallet.assetPolicies[]` una entrada con el
  token ficticio `DEMO-STABLE` y una dirección placeholder.
- **Impacto:** en un despliegue real esa política no aplica a ningún activo
  verdadero, y su presencia puede dar la impresión de que hay límites
  configurados cuando no los hay para los activos que sí se usan.
- **Recomendación:** un comentario en el propio JSON —o una entrada en la lista
  de comprobación previa al uso real— que obligue a sustituirla.

---

## Lo que **no** es deuda técnica

Merece decirse explícitamente, porque a primera vista podrían parecerlo:

| Elemento | Por qué es una decisión, no una carencia |
|---|---|
| Sin base de datos | Razonado en `../ADR-0002-almacenamiento-inteligencia.md`, con criterio de revisión |
| Sin TypeScript | Razonado en `../ADR-0001-plataforma-y-lenguaje.md`; el precio se paga en validación explícita, que existe y es exhaustiva |
| Sin framework web | Reduce superficie de ataque y elimina el árbol de dependencias |
| Sin dependencias | Es la característica central, con gate ejecutable |
| Sin autenticación | Coherente con el modelo de despliegue local, aunque exige documentar el requisito de proxy si se expone |
| Renderizador Markdown propio | Consecuencia coherente de «cero dependencias también en las herramientas» |
| Reglas escritas a mano, no configurables | La explicación, la causa raíz y la remediación son parte del valor; un motor de reglas genérico las perdería |

---

## Decisiones que requieren validación humana

| # | Pregunta | Documento |
|---|---|---|
| 1 | ¿`BitcoinRpcConnector` es una extensión prevista o un resto? | 04, R-19 |
| 2 | ¿Se versionan los PDF generados o se producen en cada publicación? | README de esta carpeta |
| 3 | ¿Cuál es la política de respaldo del estado cifrado? | 07, R-03 |
| 4 | ¿Se soporta el despliegue en contenedor con datos reales? | 02, 13 |
| 5 | ¿Los permisos POSIX `0600`/`0700` tienen efecto suficiente en Windows? | 07 |
| 6 | ¿Se contempla un estado escrito por una versión superior? | R-14 |
| 7 | ¿Se firma el artefacto de Windows con un certificado de código? | 11 |
| 8 | ¿La ausencia de `fsync` es aceptable? | R-21 |

---

## Plan sugerido

**Antes de usar el sistema con datos reales (P1)**

1. R-03 · documentar respaldo y clave.
2. R-02 · bloqueo de instancia única.
3. R-01 · regla de colector silencioso.

**Próxima versión (P2)**

4. R-07 · escapes en lugar de bytes nulos —dos caracteres.
5. R-08 · versión desde `package.json`.
6. R-09 · truncado de lote explícito.
7. R-11 · aviso al exponer fuera de loopback.
8. R-24 · política de demostración marcada.
9. R-17 y R-25 · pruebas de `mergeIncidents`, `assessRisk`, `escapeHtml` y `BLK-ACCESS-002`.
10. R-05 / R-06 · índice de duplicados y cota de retención.

**Cuando haya capacidad (P3)**

El resto, empezando por R-13 y R-14, que son baratos y mejoran la confianza de
quien audita la configuración.

---

## Documentos relacionados

- [11 · Seguridad](11-security.md)
- [12 · Pruebas y calidad](12-testing-and-quality.md)
- [17 · Resumen ejecutivo](17-executive-summary.md)
- [`../ROADMAP.md`](../ROADMAP.md)
<!-- navegacion -->
---

**[← 14 · Solución de problemas](14-troubleshooting.md)** · **[Índice](README.md)** · **[16 · Glosario →](16-glossary.md)**
