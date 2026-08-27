# Documentación del sistema · RootCause Blockchain Security

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27

Portada e índice navegable de la documentación de análisis, comprensión y
auditoría del repositorio.

| Campo | Valor |
|---|---|
| **Sistema** | RootCause Blockchain Security |
| **Versión analizada** | `0.3.0` (campo `version` de `package.json`) |
| **Commit analizado** | `6d96e71` (rama `main`) |
| **Fecha del análisis** | 27 de agosto de 2026 |
| **Etiqueta git más reciente** | `v0.1.0` |
| **Lenguaje** | JavaScript (ESM), Node.js `>=22.12.0` |
| **Dependencias de terceros** | 0 (verificado por `scripts/check-local-only.js`) |
| **Licencia** | MIT |

## Qué es este sistema, en una frase

Una **aplicación de escritorio local y watch-only** que inventaría aplicaciones
blockchain, detecta fallas de control con reglas deterministas, correlaciona
eventos on-chain públicos y produce incidentes con causa raíz —**sin custodiar
claves privadas y sin ejecutar ninguna transacción**.

## Propósito de esta documentación

Esta carpeta no sustituye a la documentación funcional que ya vive en
[`docs/`](../INDEX.md): la **complementa** con lo que faltaba para incorporarse
al proyecto o auditarlo desde cero.

- Un desarrollador nuevo encuentra aquí el mapa del código, el itinerario de
  lectura y la explicación módulo a módulo.
- Una persona ajena al sistema encuentra la descripción general y el resumen
  ejecutivo, escritos sin jerga.
- Un desarrollador experimentado encuentra la referencia técnica de funciones,
  constantes, rutas, variables y códigos de error.
- Un auditor encuentra la arquitectura, el mecanismo de persistencia, el flujo
  del dato, la postura de seguridad, la matriz de trazabilidad y el registro de
  riesgos y deuda técnica.
- Otro agente de IA encuentra un contexto verificable, con la evidencia
  (archivo y símbolo) al lado de cada afirmación.

## Tabla de contenidos

| # | Documento | Para quién | Estado |
|---|---|---|---|
| — | [`README.md`](README.md) | Todos | Completo |
| 01 | [Descripción general del sistema](01-system-overview.md) | Todos | Completo |
| 02 | [Instalación y ejecución](02-installation-and-execution.md) | Desarrollo · Operación | Completo |
| 03 | [Arquitectura](03-architecture.md) | Desarrollo · Auditoría | Completo |
| 04 | [Mapa del código](04-code-map.md) | Desarrollo | Completo |
| 05 | [Referencia técnica](05-technical-reference.md) | Desarrollo | Completo |
| 06 | [Explicación profunda del código](06-deep-code-explanation.md) | Desarrollo | Completo |
| 07 | [Persistencia y modelo de almacenamiento](07-database.md) | Desarrollo · Auditoría | Completo |
| 08 | [Flujo de datos](08-data-flow.md) | Desarrollo · Auditoría | Completo |
| 09 | [APIs e integraciones](09-apis-and-integrations.md) | Desarrollo · Integración | Completo |
| 10 | [Configuración](10-configuration.md) | Operación | Completo |
| 11 | [Seguridad](11-security.md) | Auditoría | Completo |
| 12 | [Pruebas y calidad](12-testing-and-quality.md) | Desarrollo · Auditoría | Completo |
| 13 | [Despliegue y operación](13-deployment-and-operations.md) | Operación | Completo |
| 14 | [Solución de problemas](14-troubleshooting.md) | Operación · Soporte | Completo |
| 15 | [Riesgos y deuda técnica](15-risks-and-technical-debt.md) | Auditoría · Dirección | Completo |
| 16 | [Glosario](16-glossary.md) | Todos | Completo |
| 17 | [Resumen ejecutivo](17-executive-summary.md) | Dirección · Cliente | Completo |
| 18 | [Guía para un nuevo desarrollador](18-new-developer-guide.md) | Desarrollo | Completo |
| 19 | [Matriz de trazabilidad](19-traceability-matrix.md) | Auditoría · QA | Completo |

## Relación con la documentación existente

El repositorio ya tenía un cuerpo documental extenso y verificado por CI. Esta
carpeta **enlaza** a esos documentos como fuente canónica en vez de copiarlos,
para que no existan dos versiones que puedan divergir.

| Tema | Fuente canónica del repositorio | Documento de esta carpeta que la referencia |
|---|---|---|
| Especificación de las 22 reglas `BLK-*` | [`../HEURISTICAS.md`](../HEURISTICAS.md) | 05, 19 |
| Los 15 indicadores `INT-*` | [`../ONCHAIN-ANALYTICS.md`](../ONCHAIN-ANALYTICS.md) | 05, 19 |
| Contrato HTTP | [`../API.md`](../API.md), [`../openapi-intelligence.yaml`](../openapi-intelligence.yaml) | 09 |
| Modelo de datos de inteligencia | [`../DATA-MODEL.md`](../DATA-MODEL.md) | 07 |
| Modelo de amenazas | [`../THREAT_MODEL.md`](../THREAT_MODEL.md) | 11 |
| Gobierno del dato | [`../DATA-GOVERNANCE.md`](../DATA-GOVERNANCE.md) | 08 |
| Runbook de incidentes | [`../RUNBOOK.md`](../RUNBOOK.md) | 13, 14 |
| Decisiones de plataforma | [`../ADR-0001-plataforma-y-lenguaje.md`](../ADR-0001-plataforma-y-lenguaje.md) | 03, 15 |
| Índice general | [`../INDEX.md`](../INDEX.md) | Todos |

## Convenciones utilizadas

Cada afirmación de esta documentación lleva, cuando corresponde, una de estas
marcas. **Ninguna afirmación sin marca debe leerse como comprobada si no cita
un archivo y un símbolo.**

| Marca | Significado |
|---|---|
| **Hecho verificado** | Se comprobó leyendo el código, ejecutando un comando o revisando un archivo del repositorio. Se cita la evidencia. |
| **Inferencia basada en el código** | Conclusión razonable a partir de lo leído, pero que el repositorio no declara explícitamente. |
| **No documentado en el repositorio** | El repositorio no dice nada al respecto. |
| **Requiere validación** | Necesita confirmación humana o una comprobación que este análisis no pudo hacer. |
| **No identificado** | Se buscó y no se encontró. |

Otras convenciones:

- Las rutas son relativas a la raíz del repositorio.
- Los nombres de funciones, clases, variables, códigos de regla y archivos se
  conservan **exactamente** como están en el código, para que la trazabilidad
  funcione con una búsqueda de texto.
- No aparece ningún secreto real. Las claves, tokens y direcciones que se citan
  son ficticias o placeholders del propio repositorio.
- Los diagramas son Mermaid y **siempre** van acompañados de una explicación en
  prosa: el diagrama ilustra, el texto es la fuente.

## Generar los PDF

Los PDF se generan desde estos mismos Markdown, para que no exista una segunda
versión que pueda quedar desactualizada:

~~~bash
node scripts/build-system-docs.js
~~~

Salida en [`pdf/`](pdf/): un PDF por documento más un compendio con todos.
El script no tiene dependencias: convierte el Markdown con
`scripts/lib/markdown.js` e imprime con un Chrome o un Edge ya instalado, por el
protocolo DevTools. Es el mismo mecanismo que usa
`scripts/render-presentation-pdf.js`.

> **Limitación conocida.** Los diagramas Mermaid se renderizan como imagen en
> GitHub, pero en el PDF aparecen como bloque encuadrado con su título y su
> código fuente. Renderizarlos como imagen exigiría incorporar la librería
> Mermaid, y este repositorio prohíbe las dependencias externas mediante un gate
> ejecutable (`scripts/check-local-only.js`). Por eso cada diagrama lleva su
> explicación en prosa: el PDF nunca pierde información, solo la ilustración.

## Elementos pendientes de validar

Estos puntos se detectaron durante el análisis y **necesitan una decisión o una
confirmación humana**. El detalle completo, con severidad y recomendación, está
en [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

1. Dos archivos fuente contienen un byte nulo literal dentro de una expresión
   regular, lo que hace que git y `grep` los traten como binarios.
2. Varias funciones exportadas no tienen ningún consumidor en el código de
   producción (solo pruebas, o ninguno).
3. La política de versionado de los PDF generados —versionarlos o generarlos en
   cada publicación— es una decisión del mantenedor.
4. El repositorio no declara una política de respaldo ni de rotación de clave
   para el estado cifrado.
5. El limitador de peticiones y la ventana de dormancia guardan estado en
   memoria del proceso: no sobreviven a un reinicio.
<!-- navegacion -->
---

**[01 · Descripción general del sistema →](01-system-overview.md)**
