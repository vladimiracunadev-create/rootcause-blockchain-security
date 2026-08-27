# 18 · Guía para un nuevo desarrollador

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

Bienvenida. Esta guía asume que sabes JavaScript y que no sabes nada de este
repositorio ni, quizá, de blockchain.

---

## Lo primero: dos ideas que explican todo lo demás

**1. Este sistema mira, no toca.**
No custodia claves privadas, no firma transacciones y no mueve fondos. No es una
opción de configuración: la capacidad **no existe en el código**, y hay scripts
que fallan el build si alguien intenta introducirla. Antes de escribir la primera
línea, interioriza esto: si tu cambio hace que la aplicación pueda firmar o
revocar algo, el cambio está mal.

**2. Este repositorio no tiene dependencias, y eso es la característica.**
No hay `node_modules`, no hay `npm install`. Todo —el servidor HTTP, el cifrado,
las pruebas, el renderizador Markdown de las herramientas— usa la biblioteca
estándar de Node o está escrito a mano. Si tu solución empieza por «instalo una
librería que…», la respuesta correcta suele ser otra.

---

## Qué leer primero, en este orden

| # | Documento | Tiempo | Qué te llevas |
|---|---|---|---|
| 1 | [`../../README.md`](../../README.md) | 15 min | Qué es y qué promete |
| 2 | [`../MANUAL_USUARIO.md`](../MANUAL_USUARIO.md) | 15 min | Qué ve el usuario en cada pantalla |
| 3 | [01 · Descripción general](01-system-overview.md) | 20 min | El sistema completo, con evidencia |
| 4 | [03 · Arquitectura](03-architecture.md) | 30 min | Las capas y por qué son así |
| 5 | [04 · Mapa del código](04-code-map.md) | 20 min | Dónde está cada cosa |
| 6 | [`../HEURISTICAS.md`](../HEURISTICAS.md) | 30 min | Las 22 reglas, que son el producto |
| 7 | [06 · Explicación profunda](06-deep-code-explanation.md) | 60 min | Cómo funciona por dentro |
| 8 | [`../DETECCION_AMENAZAS.md`](../DETECCION_AMENAZAS.md) | 20 min | **Qué NO detecta.** Léelo entero |
| 9 | [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) | 10 min | Las reglas de la casa |

El documento 8 importa más de lo que su posición sugiere: entender los límites
del producto evita que propongas cosas que el proyecto ha decidido no hacer, y
por buenas razones.

---

## Preparar el entorno

~~~bash
git clone https://github.com/vladimiracunadev-create/rootcause-blockchain-security.git
~~~

~~~bash
node --version
~~~

Necesitas **Node 22.12 o superior**. Y ya está: **no hay paso de instalación**.

~~~bash
node --test
~~~

Deberías ver 144 pruebas pasando en unos 10 segundos. Si las ves, tu entorno está
listo.

~~~bash
node src/server.js
~~~

Abre `http://127.0.0.1:8790`. Estás en modo demostración: el estado vive en
memoria y trae datos de ejemplo con **un incidente por cada regla de wallet**.

Para desarrollo, con recarga al guardar:

~~~bash
node --watch src/server.js
~~~

---

## Cómo está organizado el repositorio

~~~text
src/
  server.js              ← punto de composición: aquí se decide TODO
  config.js              ← configuración congelada, con rangos forzados
  app.js                 ← postura HTTP: cabeceras, ritmo, cuerpo, estáticos
  api/                   ← enrutado, nada más
  domain/                ← reglas puras. No conoce disco, red ni HTTP
    intelligence/        ← modelo, indicadores, grafo y puntaje
  infrastructure/        ← cifrado, auditoría, JSON-RPC
  services/              ← casos de uso: validan, mutan, auditan
  web/static/            ← el panel, sin framework
config/                  ← políticas y catálogos (se leen al arrancar)
scripts/                 ← validadores, gates y herramientas
test/                    ← 13 archivos, 144 pruebas
examples/datasets/       ← 10 escenarios con su resultado esperado
~~~

**La regla de dependencias, que no se negocia:** el dominio no importa nada que
no sea `node:crypto` u otro módulo del dominio. Compruébalo tú:

~~~bash
grep -rn "^import" src/domain/
~~~

---

## Sigue un flujo completo, de principio a fin

Es la forma más rápida de entender el sistema. Sigue este camino con el editor
abierto:

1. **`src/server.js` · `buildRuntime`** — mira cómo se elige el almacén según
   `DEMO_MODE` y cómo se registran los conectores.
2. **`src/app.js` · `application`** — el orden importa: cabeceras, ritmo,
   validación de mutación, y solo entonces el router.
3. **`src/api/router.js` · `createApiRouter`** — busca la ruta `POST /api/scan`.
4. **`src/services/defense-service.js` · `DefenseService.scan`** — verás que todo
   pasa por `mutate()`.
5. **`mutate()`** — lee cómo se serializan las escrituras con `writeQueue`. Es la
   pieza que evita perder cambios.
6. **`src/domain/rule-engine.js` · `evaluateState`** — función pura: entra un
   estado, salen hallazgos.
7. **`src/domain/wallet-rules.js` · `evaluateWalletPosture`** — las 8 reglas de
   wallet.
8. **`mergeIncidents`** en `defense-service.js` — **lee esta función dos veces.**
   Es donde un hallazgo instantáneo se convierte en un incidente con historia.
9. **`src/infrastructure/audit-log.js` · `appendAuditEntry`** — la cadena de
   hashes.
10. **`src/infrastructure/encrypted-store.js` · `save`** — cifrar, escribir en
    temporal, renombrar.

Cuando entiendas ese camino, el resto del sistema es una variación del mismo
patrón.

---

## Añadir una regla `BLK-*`

El repositorio te obliga a hacerlo bien: el gate de cobertura falla si te dejas
un sitio.

**1. Emitir el hallazgo** en `src/domain/rule-engine.js` o en
`src/domain/wallet-rules.js`, con `makeFinding`:

~~~js
findings.push(makeFinding({
  code: "BLK-EJEMPLO-001",
  entityType: "contract",
  entityId: contract.address,
  discriminator: project.id,
  severity: severityFor(project),
  title: "…",
  explanation: "…",
  rootCause: "…",
  evidence: { /* con procedencia verificable */ },
  remediation: ["…", "…"]
}));
~~~

**2. Añadirla a un control** en `config/control-catalog.json`. Cada código
pertenece a **exactamente un** control.

**3. Añadirla a `rules[]`** en `config/policies.json`, con su umbral si lo tiene.

**4. Documentarla en el `README.md`** —la tabla de reglas— y en
[`../HEURISTICAS.md`](../HEURISTICAS.md).

**5. Añadir un escenario** en `src/services/demo-state.js` que la dispare, y
comprobar que la cuenta sana **no** la dispara.

**6. Escribir dos pruebas**: una que la active y otra que compruebe que se
mantiene callada cuando no debe activarse. La segunda es la que evita el fallo
más caro de un motor de detección: una regla que grita siempre.

**7. Verificar:**

~~~bash
node scripts/check-rule-coverage.js
~~~

### Qué hace buena a una regla en este proyecto

| Requisito | Por qué |
|---|---|
| **Determinista** | Mismos datos, mismo resultado, siempre |
| **Con causa raíz**, no solo síntoma | Es el nombre del producto |
| **Con evidencia de procedencia** | Bloque, transacción, log: debe poder verificarse en otra fuente |
| **Con remediación accionable** | Pasos concretos, no «revisar la configuración» |
| **Con severidad proporcional a la criticidad** | Usa `severityFor` |
| **Que calle ante un dato incompleto** | Mejor un falso negativo silencioso que un hallazgo sobre un dato que no se entiende |
| **Con `id` estable** | Si cambias `code` o `discriminator`, rompes la continuidad del incidente |

---

## Añadir un indicador `INT-*`

Igual de guiado. Un indicador **no es** una violación de política: es una señal
investigable.

1. Escribir el detector en `src/domain/intelligence/indicators.js` y llamarlo
   desde `evaluateIndicators`.
2. Añadirlo a `config/intelligence-indicators.json` con familia, título,
   descripción, severidad, confianza por defecto, **al menos dos falsos
   positivos** y una acción recomendada. El gate exige los dos falsos positivos.
3. Añadir sus umbrales a `config/intelligence-policies.json`.
4. Documentarlo en [`../ONCHAIN-ANALYTICS.md`](../ONCHAIN-ANALYTICS.md).
5. Crear un dataset en `examples/datasets/` con su `expected.indicators`.
6. Escribir la prueba en `test/intelligence-indicators.test.js`.
7. `node scripts/check-rule-coverage.js`.

**Los textos vienen del catálogo, no del código.** El detector aporta la
explicación concreta y la evidencia; el título, la descripción, los falsos
positivos y la acción recomendada salen del JSON.

---

## Añadir un endpoint

- **De defensa**, en `src/api/router.js`: una comprobación de método y ruta más
  la llamada al servicio.
- **De inteligencia**, en `src/api/intelligence-router.js`: una entrada más en la
  tabla `routes`, con `method`, `pattern` y `handler`. Reutiliza los fragmentos
  `NETWORK`, `ADDRESS` e `IDENTIFIER` para validar los parámetros.

Reglas:

- toda mutación exige `x-rootcause-request: 1` —lo aplica `src/app.js`, no tú—;
- valida los parámetros con `textParam` e `integerParam`;
- llama a `assertNoSecretMaterial` si el cuerpo puede traer datos del usuario;
- registra en la auditoría cualquier cosa que mute estado;
- si tu endpoint puede truncar un resultado, **dilo en la respuesta**.

---

## Dónde poner cada cosa

| Si estás escribiendo… | Va en… |
|---|---|
| Una regla o un cálculo puro | `src/domain/` |
| Validación de entrada del usuario | Los normalizadores de `src/services/` |
| Algo que escribe estado | Un método de servicio, siempre dentro de `mutate()` |
| Algo que habla con el exterior | `src/infrastructure/` o un conector |
| Una ruta HTTP | `src/api/` |
| Interfaz | `src/web/static/` |
| Un umbral o un texto de catálogo | `config/` |
| Una comprobación de invariante | `scripts/` |

---

## Partes que requieren especial cuidado

| Parte | Por qué | Antes de tocarla |
|---|---|---|
| `findingId` y `stableId` | Cambiarlas rompe la continuidad de incidentes y alertas | Entiende `mergeIncidents` primero |
| `mergeIncidents` | Gobierna todo el ciclo de vida | Escribe la prueba antes que el cambio |
| `assertNoSecretMaterial` | Es la promesa central del producto | 7 invariantes la vigilan |
| `READ_ONLY_METHODS` | Añadir un método puede convertir el observador en algo que muta | Un gate **y** un `grep` en CI la vigilan |
| La CSP de `src/app.js` | Un gate comprueba que no se relaja | — |
| `escapeHtml` en el panel | Es la única defensa contra XSS | Nunca interpoles un valor sin ella |
| `appendAuditEntry` / `canonicalize` | Cambiarlas invalida todas las cadenas ya escritas | — |
| `EncryptedFileStore.save` | La atomicidad depende del `rename` final | — |
| `mutate` | Sin la cola se pierden escrituras | — |
| Las cotas del grafo | Sin ellas, una consulta puede agotar la memoria | — |

---

## Convenciones que debes respetar

**Del código**

1. ESM (`import`/`export`), nunca `require`.
2. Solo `node:` y rutas relativas en los `import`. **Sin excepciones**, tampoco
   para herramientas.
3. Dos espacios de indentación, UTF-8, finales LF —salvo los archivos de
   `packaging/windows`, que necesitan CRLF—.
4. Nombres de dominio en inglés, textos de usuario en español.
5. Los montos son **cadenas de dígitos** en unidades mínimas. Nunca coma
   flotante.
6. Las fechas son ISO-8601 UTC.
7. Los objetos de configuración van congelados con `Object.freeze`.
8. Todo lo que puede crecer lleva una cota, y cuando se alcanza **se declara**.

**De los comentarios**

El repositorio tiene un estilo muy definido y merece la pena seguirlo: los
comentarios explican **por qué** existe el código, qué problema resuelve y qué
riesgos tiene cambiarlo. No repiten lo que la línea ya dice. Cuando una decisión
tiene una contrapartida incómoda, el comentario la nombra. Mira la cabecera de
`src/domain/intelligence/risk-score.js` como referencia.

**De las pruebas**

- Una prueba positiva y otra negativa por regla.
- Nunca `.only`: `scripts/validate-repo.js` falla si lo encuentra.
- Datos deterministas: sin fechas reales ni aleatoriedad.

**De la documentación**

- Si mencionas una ruta de archivo en un `.md`, esa ruta **debe existir**:
  `scripts/check-docs.js` comprueba tanto los enlaces como las rutas escritas en
  prosa.
- Si el README anuncia una cifra, algún gate debería verificarla.

---

## Antes de cada commit

~~~bash
pnpm check
~~~

O, sin pnpm, los cinco pasos:

~~~bash
node scripts/validate-repo.js && node --test && node scripts/check-local-only.js && node scripts/check-security-claims.js && node scripts/check-rule-coverage.js && node scripts/check-docs.js
~~~

**Si un gate falla, arregla el código, no el gate.** Los gates son la
especificación de seguridad del producto; relajarlos es exactamente lo que
existen para impedir.

---

## Tareas iniciales apropiadas

Ordenadas de menor a mayor dificultad. Todas son cambios reales y útiles,
tomados del registro de
[15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

### Nivel 1 · para conocer el terreno

| Tarea | Qué aprendes | Referencia |
|---|---|---|
| Escribir pruebas para `escapeHtml` | El panel y su defensa contra XSS | R-17 |
| Sustituir los bytes nulos literales por sus escapes en los dos archivos afectados | Cómo git trata los archivos y por qué importa | R-07 |
| Añadir `--experimental-test-coverage` como script | El ejecutor de pruebas de Node | R-18 |
| Marcar en el JSON la configuración declarada y no leída | El vínculo entre configuración y código | R-13 |

### Nivel 2 · lógica de negocio

| Tarea | Qué aprendes | Referencia |
|---|---|---|
| Pruebas de `mergeIncidents`: las cuatro propiedades del ciclo de vida | El corazón del producto | R-17 |
| Pruebas de `assessRisk`: puntaje sin indicadores, decaimiento, tope de repetición | El modelo de riesgo | R-17 |
| Pruebas de `withRetry` e `isRetryable` con `sleep` inyectado | La capa de adquisición | R-17 |
| Leer la versión de `package.json` en vez de la cadena literal de `/api/health` | Cómo se compone el runtime | R-08 |

### Nivel 3 · cambios con criterio

| Tarea | Qué aprendes | Referencia |
|---|---|---|
| Hacer explícito el truncado del lote de ingesta | El contrato de la API y el principio de «si truncas, dilo» | R-09 |
| Aviso al arrancar con bind no loopback | El modelo de confianza | R-11 |
| Archivo de bloqueo de instancia única | La integridad del estado | R-02 |
| **Una regla nueva de colector silencioso** | El flujo completo: motor, catálogo, política, README, demo y pruebas | R-01 |

Esa última es la mejor tarea de incorporación del repositorio: te obliga a tocar
todas las capas y a pasar por todos los gates. Y cierra el hueco de detección más
importante que tiene el sistema hoy.

---

## Itinerario sugerido

| Día | Objetivo |
|---|---|
| **1** | Leer los documentos 1 a 4. Arrancar la aplicación. Recorrer las cinco vistas del panel. Ejecutar `pnpm check` y ver qué comprueba cada gate |
| **2** | Seguir el flujo completo de `POST /api/scan` con el editor abierto. Leer `mergeIncidents` dos veces |
| **3** | Leer `../HEURISTICAS.md` con `src/domain/wallet-rules.js` al lado. Ejecutar `node --test test/wallet-rules.test.js` y leer las pruebas |
| **4** | Dominio de inteligencia: `model.js`, `indicators.js`, `graph.js`, `risk-score.js`. Cargar un dataset y consultar una dirección por la API |
| **5** | Leer los cuatro gates de `scripts/`. Entender qué protege cada uno |
| **6** | Una tarea de nivel 1, con su prueba y su `pnpm check` en verde |
| **7-10** | Una tarea de nivel 2 |
| **11+** | Una tarea de nivel 3 |

---

## Dudas frecuentes

**¿Por qué no hay TypeScript?**
Ver [`../ADR-0001-plataforma-y-lenguaje.md`](../ADR-0001-plataforma-y-lenguaje.md).
La compensación es que la validación en el borde es explícita y exhaustiva: mira
los normalizadores de `src/services/defense-service.js`.

**¿Por qué no hay base de datos?**
Ver [`../ADR-0002-almacenamiento-inteligencia.md`](../ADR-0002-almacenamiento-inteligencia.md).
El ADR además dice **cuándo** habría que revisar la decisión.

**¿Puedo añadir una librería pequeña, solo para desarrollo?**
No. La cabecera de `scripts/check-local-only.js` lo responde: «una dependencia de
construcción es una dependencia». La alternativa que el repositorio adopta es
escribirla —`scripts/lib/markdown.js`— o usar algo ya instalado en el sistema por
un protocolo estándar —el navegador para los PDF—.

**¿Por qué las reglas están en código y no en un motor configurable?**
Porque la explicación, la causa raíz y la remediación **son** el valor del
producto, y un motor de reglas genérico las perdería. Los umbrales sí están en
configuración; la lógica y el texto, no.

**¿Por qué el puntaje nunca se devuelve solo?**
Está explicado en la cabecera de `src/domain/intelligence/risk-score.js`: un
número sin explicación no se puede discutir, corregir ni auditar, y acaba
usándose como veredicto.

---

## Documentos relacionados

- [04 · Mapa del código](04-code-map.md)
- [06 · Explicación profunda del código](06-deep-code-explanation.md)
- [12 · Pruebas y calidad](12-testing-and-quality.md)
- [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md)
- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)
<!-- navegacion -->
---

**[← 17 · Resumen ejecutivo](17-executive-summary.md)** · **[Índice](README.md)** · **[19 · Matriz de trazabilidad →](19-traceability-matrix.md)**
