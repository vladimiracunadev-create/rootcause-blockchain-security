# 12 · Pruebas y calidad

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

## Tipos de prueba existentes

**Hecho verificado** — el repositorio usa exclusivamente el ejecutor integrado
`node --test`. No hay Jest, Vitest, Mocha ni ningún otro marco: sería una
dependencia, y el gate `scripts/check-local-only.js` no lo permitiría.

| Tipo | Dónde | Cómo se reconoce |
|---|---|---|
| **Unitarias de dominio** | `test/rule-engine.test.js`, `test/wallet-rules.test.js`, `test/intelligence-indicators.test.js`, `test/intelligence-graph.test.js`, `test/intelligence-model.test.js`, `test/secret-guard.test.js` | Llaman a funciones puras con estado construido a mano |
| **Unitarias de infraestructura** | `test/encrypted-store.test.js`, `test/audit-log.test.js`, `test/evm-rpc.test.js` | Ejercitan cifrado, encadenado y allowlist |
| **De integración HTTP** | `test/api.test.js`, `test/intelligence-api.test.js` | Arrancan el servidor real en un puerto efímero y hacen peticiones |
| **De pipeline** | `test/intelligence-pipeline.test.js` | Recorren ingesta → análisis → alerta → caso → evidencia → informe |
| **De empaquetado** | `test/desktop-launch.test.js` | Comprueban la guarda de apertura del navegador |
| **De invariantes en caliente** | `scripts/check-security-claims.js` | Arranca la aplicación y la ataca. No es `node --test`, pero es una prueba de sistema |
| **De coherencia documental** | `scripts/check-docs.js`, `scripts/check-rule-coverage.js` | Verifican que documentación, catálogos y código no divergen |

---

## Cobertura observable

**No hay herramienta de cobertura configurada.** `.gitignore` menciona
`coverage/`, lo que sugiere que alguna vez se generó, pero **no hay script ni
job de CI que la produzca**. Node trae `--experimental-test-coverage`, que
serviría sin añadir dependencias. Registrado como recomendación en
[15 · Riesgos](15-risks-and-technical-debt.md).

### Cobertura estimada por módulo

**Inferencia basada en la lectura de las pruebas.** No es una medición.

| Módulo | Pruebas dedicadas | Cobertura aparente |
|---|---|---|
| `src/domain/wallet-rules.js` | 33 | **Muy alta** — cada regla con su caso positivo **y** su negativo |
| `src/services/intelligence-service.js` | 26 (pipeline) + 14 (API) | **Alta** |
| `src/domain/intelligence/indicators.js` | 14 | **Alta** |
| `src/domain/intelligence/graph.js` | 13 | **Alta** |
| `src/domain/intelligence/model.js` | 9 | **Alta**, incluidos casos negativos de checksum |
| `src/api/intelligence-router.js` | 14 | **Alta** |
| `src/app.js` + `src/api/router.js` | 7 | **Media** — la postura HTTP se cubre además en el gate |
| `src/infrastructure/evm-rpc.js` | 4 | **Media** |
| `src/domain/rule-engine.js` | 4 | **Media** — 14 reglas con 4 pruebas de primer nivel |
| `src/infrastructure/encrypted-store.js` | 3 | **Media** |
| `src/domain/secret-guard.js` | 3 | **Media**, reforzada con 7 invariantes en caliente |
| `src/infrastructure/audit-log.js` | 2 | **Media** |
| `src/server.js` | 2 | **Baja** — solo la guarda del navegador |
| `src/domain/intelligence/risk-score.js` | **0 dedicadas** | Indirecta vía API y pipeline |
| `src/services/defense-service.js` | **0 dedicadas** | Indirecta vía `test/api.test.js` |
| `src/services/intelligence-connectors.js` | **0 dedicadas** | Parcial vía pipeline |
| `src/services/watchtower.js` | **0** | **Sin cobertura** |
| `src/services/demo-state.js` | 1 (dentro de wallet-rules) | Indirecta pero muy efectiva |
| `src/web/static/app.js` | **0** | **Sin cobertura** — 660 líneas |

---

## Cómo ejecutar las pruebas

~~~bash
node --test
~~~

Con salida detallada por archivo:

~~~bash
node --test --test-reporter=spec
~~~

Un archivo concreto:

~~~bash
node --test test/wallet-rules.test.js
~~~

**Resultado del 27 de agosto de 2026** (commit `6d96e71`, Node v24.11.1):

~~~text
ℹ tests 144
ℹ pass 144
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 9240.3112
~~~

**Nada está marcado como pendiente ni omitido**, lo cual es un dato relevante:
no hay pruebas desactivadas ocultando fallos.

---

## Datos y fixtures

| Fixture | Uso |
|---|---|
| `src/services/demo-state.js` | **El fixture principal**: 9 escenarios que cubren las 8 reglas de wallet más una cuenta sana |
| `examples/datasets/` | 10 escenarios de inteligencia, cada uno con `expected.indicators` |
| `examples/project.sample.json` | Inventario de ejemplo |
| `examples/account.watched.sample.json` | Cuenta vigilada de ejemplo |
| `examples/event.*.json` | Tres eventos de ejemplo |
| Estado construido en línea | La mayoría de las pruebas de dominio |

### El fixture más valioso del repositorio

La prueba `demo state produces every wallet rule exactly once and a healthy
account` comprueba dos cosas a la vez:

1. que el estado de demostración **cubre las 8 reglas de wallet**;
2. que **ninguna regla dispara donde no debería** —la cuenta sana tiene que
   quedar limpia.

Una regla nueva sin escenario, o un escenario que active de más, hace fallar la
suite. Es un fixture que se comporta como un gate.

### Los datasets como oráculo

Cada dataset declara qué indicadores debería activar:

~~~json
"expected": {
  "indicators": ["INT-FLOW-001", "INT-ASSET-001"],
  "note": "El fan-in dispara ademas la concentracion de activo…"
}
~~~

Que la expectativa viva **en el dato** y no en la prueba tiene una consecuencia
útil: al añadir un escenario, el autor tiene que declarar qué espera, y eso
obliga a pensar el caso antes de escribirlo. El campo `note` documenta además
por qué se activan indicadores que a primera vista parecerían de más.

---

## Módulos sin pruebas

| Módulo | Líneas | Riesgo de no probarlo | Prioridad |
|---|---|---|---|
| `src/web/static/app.js` | 660 | **Medio.** Un fallo de `escapeHtml` sería un XSS; un fallo de renderizado se ve al mirar | **Alta** para `escapeHtml`, media para el resto |
| `src/services/watchtower.js` | 40 | **Medio.** Guarda de reentrada y `unref` sin verificar | **Media** — es pequeño y fácil de probar |
| `src/services/intelligence-connectors.js` | 405 | **Medio.** `withRetry`, `isRetryable` y `RateLimiter` son lógica pura y sin cobertura directa | **Alta** — la función `sleep` ya es inyectable, así que probarlo es barato |
| `src/domain/intelligence/risk-score.js` | 245 | **Alto.** Es el módulo más visible del producto y solo se prueba de forma indirecta | **Alta** |
| `src/services/defense-service.js` | 714 | **Alto.** `mergeIncidents` gobierna el ciclo de vida completo de los incidentes | **Alta** para `mergeIncidents` y los normalizadores |

### Propuesta priorizada de pruebas faltantes

| # | Prueba propuesta | Por qué | Coste |
|---|---|---|---|
| 1 | `mergeIncidents`: reaparición conserva `createdAt`, `acknowledged` sobrevive, ausencia resuelve, `resolved` que reaparece vuelve a `open` | Gobierna todo el ciclo de vida y no tiene prueba directa | Bajo |
| 2 | `assessRisk`: puntaje 0 sin indicadores, decaimiento por antigüedad, tope de repetición, `requiresHumanReview` siempre `true`, banda por umbral | Es la salida más visible del producto | Bajo |
| 3 | `escapeHtml` con los cinco caracteres y con `null`/`undefined` | Es la única defensa contra XSS en el panel | Muy bajo |
| 4 | `withRetry` e `isRetryable`: no reintentar rechazos de política, espera exponencial con `sleep` inyectado | Lógica pura ya preparada para probarse | Bajo |
| 5 | `Watchtower`: la guarda de reentrada descarta el ciclo solapado; un error no derriba el proceso | Módulo pequeño con dos invariantes claros | Bajo |
| 6 | Normalizadores de `defense-service`: casos límite de cada validador | 714 líneas de validación probadas solo de refilón | Medio |
| 7 | Concurrencia de `mutate`: dos mutaciones simultáneas y ninguna escritura perdida | Es la garantía de integridad del estado | Medio |
| 8 | Cobertura con `--experimental-test-coverage` en CI | Convierte la estimación de esta tabla en una medición | Bajo |

---

## Herramientas de análisis estático

| Herramienta | Estado |
|---|---|
| ESLint | **No presente.** Sería una dependencia |
| Prettier | **No presente.** El formato lo fija `.editorconfig` |
| TypeScript | **No presente.** Decisión documentada en `../ADR-0001-plataforma-y-lenguaje.md` |
| `node --check` | **Sí** — `scripts/validate-repo.js` lo ejecuta sobre **todos** los `.js` |
| **CodeQL** | **Sí** — workflow `codeql.yml` |

El linter real del proyecto es `scripts/validate-repo.js`, que comprueba:

- que existan los 24 archivos declarados como obligatorios;
- que no haya artefactos de otros gestores de paquetes;
- que 4 archivos JSON parseen;
- que `packageManager` declare pnpm;
- que **todos** los `.js` pasen `node --check`;
- que ningún archivo de texto contenga material privado incrustado;
- que ninguna prueba use `.only`, que ocultaría el resto de la suite.

Esa última comprobación es más valiosa de lo que parece: un `.only` olvidado
deja la suite en verde ejecutando una sola prueba.

---

## Linting y formato

`.editorconfig` fija: UTF-8, finales de línea LF, línea final obligatoria,
indentación de 2 espacios, y sin recorte de espacios finales en Markdown —donde
dos espacios al final significan salto de línea.

`.gitattributes` fuerza LF en todo salvo en los archivos de empaquetado de
Windows (`.cmd`, `.bat`, `.ps1`, `.iss` y los `.txt` de `packaging/windows`),
que necesitan CRLF porque `cmd.exe` interpreta mal los bloques multilínea con
finales Unix.

**Anomalía detectada:** dos archivos fuente contienen un byte nulo literal, lo
que hace que git los trate como binarios y **no les aplique la normalización de
finales de línea**. Ver [15 · Riesgos](15-risks-and-technical-debt.md).

---

## Integración continua

Cuatro workflows. El detalle está en [`../CI_GITHUB.md`](../CI_GITHUB.md).

### `ci.yml` — seis jobs

| Job | Plataforma | Qué protege |
|---|---|---|
| `calidad` | **Matriz 3 × 2**: Windows, Ubuntu, macOS × Node 22, 24 | Validación del repositorio y las 144 pruebas |
| `solo-local` | Ubuntu | Cero dependencias, cero orígenes remotos, CSP intacta. **Con una segunda comprobación independiente** del árbol de dependencias |
| `invariantes` | Ubuntu | Los 51 invariantes en caliente **más** un `grep` propio contra métodos RPC de firma |
| `reglas` | Ubuntu | Coherencia motor ↔ catálogo ↔ política ↔ README |
| `app-windows` | Windows | **Empaqueta y ARRANCA** la aplicación real, pide `/api/health`, el panel y `/api/summary`, y comprueba que hay inventario dentro |
| `documentacion` | Ubuntu | Todos los enlaces internos existen |

### Prácticas de robustez verificadas

| Práctica | Evidencia |
|---|---|
| Acciones pinneadas a **commit SHA** | `actions/checkout@08eba0b…`, `actions/setup-node@82076278…` |
| Permisos mínimos | `permissions: contents: read` |
| Concurrencia con cancelación | `concurrency: ci-${{ github.ref }}` con `cancel-in-progress` |
| Timeouts explícitos | 10 min por job, 25 el de Windows |
| **Sin instalación de dependencias** | Ningún `npm ci` ni `pnpm install`: CI nunca toca un registro de paquetes |
| `fail-fast: false` en la matriz | Un fallo en macOS no oculta el resultado de Windows |
| Artefacto de CI publicado | El ZIP portable, con retención de 7 días y `if-no-files-found: error` |

### El job que hace la diferencia

`app-windows` no se conforma con comprobar que el ZIP tiene el tamaño esperado:
lo descomprime, **ejecuta el lanzador `.cmd` real** —el que usa el usuario, no
una invocación artificial de `node`— y comprueba tres cosas:

1. que `/api/health` responde con el `service` correcto;
2. que el panel contiene el título de la aplicación;
3. que `/api/summary` devuelve **al menos un proyecto**.

El comentario del workflow explica el porqué de la tercera: «una app que arranca
vacía es exactamente el fallo que nadie detecta a tiempo». Un artefacto puede
compilar, tener el checksum correcto y la versión correcta, y estar vacío por
dentro.

### Otros workflows

| Workflow | Función |
|---|---|
| `codeql.yml` | Análisis estático de seguridad de GitHub |
| `release-windows.yml` | Publica la edición de Windows al etiquetar |
| `deploy-landing.yml` | Publica la página de producto y la presentación |

---

## Criterios de aceptación

**Inferencia basada en `CONTRIBUTING.md` y en la configuración de CI.** Un cambio
es aceptable cuando:

1. `pnpm check` pasa entero;
2. no introduce ninguna dependencia;
3. si añade una regla, esa regla está en el motor, en el catálogo, en la política
   y en el README —o `check:rules` falla;
4. si añade un indicador, tiene umbral, **al menos dos falsos positivos**, acción
   recomendada y documentación —o `check:rules` falla;
5. no rompe ningún invariante de seguridad;
6. no deja enlaces rotos en la documentación;
7. no relaja la CSP ni la allowlist RPC.

Los puntos 3 y 4 son especialmente valiosos: convierten «documentar la regla» de
una buena intención en un requisito mecánico.

---

## Casos límite relevantes ya cubiertos

| Caso | Prueba |
|---|---|
| Dato incompleto no produce hallazgo | «incomplete evidence (invalid amountRaw) never produces an allowance finding» |
| Los hallazgos conservan identidad entre ejecuciones | «wallet findings keep stable identities across evaluations» |
| Cada regla dispara una vez y solo una | «demo state produces every wallet rule exactly once and a healthy account» |
| Direcciones Bitcoin con checksum alterado | Casos negativos en `test/intelligence-model.test.js` |
| El grafo respeta sus cotas ante valores extremos | `test/intelligence-graph.test.js` y el gate |
| La cadena de auditoría detecta manipulación | `test/audit-log.test.js` |
| El RPC rechaza métodos fuera de la allowlist | `test/evm-rpc.test.js` |
| Cada regla de wallet tiene su caso negativo | 15 pruebas «stays quiet…» en `test/wallet-rules.test.js` |

Ese último patrón —una prueba positiva y otra negativa por regla— es el que
evita el fallo más caro de un motor de detección: una regla que se activa
siempre. Un motor que grita constantemente se acaba ignorando, y entonces deja
de proteger.

---

## Documentos relacionados

- [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md)
- [18 · Guía para un nuevo desarrollador](18-new-developer-guide.md)
- [19 · Matriz de trazabilidad](19-traceability-matrix.md)
- [`../CI_GITHUB.md`](../CI_GITHUB.md)
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — cómo añadir una regla sin romper los gates
<!-- navegacion -->
---

**[← 11 · Seguridad](11-security.md)** · **[Índice](README.md)** · **[13 · Despliegue y operación →](13-deployment-and-operations.md)**
