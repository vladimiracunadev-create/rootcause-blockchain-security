# Índice de documentación

RootCause Blockchain Security — consola local watch-only para aplicaciones
blockchain. Todo lo que este repositorio afirma está verificado por un gate
ejecutable; los documentos explican el porqué.

## Para usuarios

| Documento | Contenido |
|---|---|
| [`../README.md`](../README.md) | Visión general, capturas del panel y arranque en 30 segundos |
| [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md) | **Qué es cada cosa del panel, en claro.** Empieza aquí |
| [`WINDOWS-APP.md`](WINDOWS-APP.md) | Instalar, configurar y verificar la aplicación de escritorio |
| [`presentacion.md`](presentacion.md) | **Presentar el producto hoy**: 8 diapositivas, demo de 90 s y pauta del expositor |
| [`RUNBOOK.md`](RUNBOOK.md) | Qué hacer ante un incidente, paso a paso |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Problemas comunes y su causa real |
| [`REQUIREMENTS.md`](REQUIREMENTS.md) | Qué hace falta para usarla, desarrollarla y empaquetarla |
| [`SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) | Antes de usarla con datos reales |
| [`BLOCKCHAIN-Y-BITCOIN.md`](BLOCKCHAIN-Y-BITCOIN.md) | Qué es cada cosa y por qué existen dos productos |

## Análisis completo del repositorio

Veinte documentos que estudian el repositorio desde cero: pensados para
incorporarse al proyecto, auditarlo o usarlos como contexto de trabajo. Enlazan
a los documentos de esta carpeta como fuente canónica en vez de duplicarlos.

| Documento | Contenido |
|---|---|
| [`system-documentation/README.md`](system-documentation/README.md) | **Portada, índice, convenciones y pendientes de validar** |
| [`system-documentation/01-system-overview.md`](system-documentation/01-system-overview.md) | El sistema explicado, incluso para quien no es técnico |
| [`system-documentation/02-installation-and-execution.md`](system-documentation/02-installation-and-execution.md) | Requisitos, arranque, pruebas y empaquetado |
| [`system-documentation/03-architecture.md`](system-documentation/03-architecture.md) | Capas, patrones y diagramas, con su explicación |
| [`system-documentation/04-code-map.md`](system-documentation/04-code-map.md) | Cada archivo y símbolo, con su estado real |
| [`system-documentation/05-technical-reference.md`](system-documentation/05-technical-reference.md) | Catálogo de constantes, funciones, rutas y errores |
| [`system-documentation/06-deep-code-explanation.md`](system-documentation/06-deep-code-explanation.md) | Cómo funciona cada módulo por dentro |
| [`system-documentation/07-database.md`](system-documentation/07-database.md) | Persistencia cifrada, diccionario de datos y modelo entidad-relación |
| [`system-documentation/08-data-flow.md`](system-documentation/08-data-flow.md) | De dónde viene el dato, cómo se valida y dónde puede perderse |
| [`system-documentation/09-apis-and-integrations.md`](system-documentation/09-apis-and-integrations.md) | Las 40 rutas y las integraciones que existen de verdad |
| [`system-documentation/10-configuration.md`](system-documentation/10-configuration.md) | Cada variable y qué pasa si se configura mal |
| [`system-documentation/11-security.md`](system-documentation/11-security.md) | Controles implementados y **controles ausentes** |
| [`system-documentation/12-testing-and-quality.md`](system-documentation/12-testing-and-quality.md) | Cobertura observable y pruebas que faltan, priorizadas |
| [`system-documentation/13-deployment-and-operations.md`](system-documentation/13-deployment-and-operations.md) | Empaquetado, CI/CD, respaldo y mantenimiento |
| [`system-documentation/14-troubleshooting.md`](system-documentation/14-troubleshooting.md) | Diagnóstico desde el código, con el módulo responsable |
| [`system-documentation/15-risks-and-technical-debt.md`](system-documentation/15-risks-and-technical-debt.md) | **25 hallazgos** con severidad, evidencia y recomendación |
| [`system-documentation/16-glossary.md`](system-documentation/16-glossary.md) | Los términos, explicados sin jerga |
| [`system-documentation/17-executive-summary.md`](system-documentation/17-executive-summary.md) | Resumen para decidir |
| [`system-documentation/18-new-developer-guide.md`](system-documentation/18-new-developer-guide.md) | Itinerario de incorporación y primeras tareas |
| [`system-documentation/19-traceability-matrix.md`](system-documentation/19-traceability-matrix.md) | De la funcionalidad a la prueba, en ambos sentidos |

Los PDF equivalentes se generan con `node scripts/build-system-docs.js`.

## Para desarrolladores

| Documento | Contenido |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Capas, flujo de datos y decisiones internas |
| [`API.md`](API.md) | Contrato HTTP completo de la API local y de la API v1 |
| [`openapi-intelligence.yaml`](openapi-intelligence.yaml) | Especificación OpenAPI de la API de riesgo para wallets |
| [`DATA-MODEL.md`](DATA-MODEL.md) | Entidades normalizadas, claves de deduplicación y niveles epistémicos |
| [`ADR-0002-almacenamiento-inteligencia.md`](ADR-0002-almacenamiento-inteligencia.md) | Por qué el MVP no añade bases de datos y cuándo revisarlo |
| [`HEURISTICAS.md`](HEURISTICAS.md) | **Especificación exacta de las 22 reglas**: condición, severidad, evidencia y umbral |
| [`COMMANDS.md`](COMMANDS.md) | Referencia de comandos: scripts, variables de entorno, API y empaquetado |
| [`CI_GITHUB.md`](CI_GITHUB.md) | Los cuatro workflows, qué protege cada uno y cómo reproducirlos |
| [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) | Publicar una versión, cada paso con su comando de verificación |
| [`ADR-0001-plataforma-y-lenguaje.md`](ADR-0001-plataforma-y-lenguaje.md) | Por qué escritorio y no SaaS; por qué Node hoy, Rust después y no Go |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Cero dependencias, cómo añadir una regla, cómo tocar la postura de seguridad |

## Seguridad y producto

| Documento | Contenido |
|---|---|
| [`DETECCION_AMENAZAS.md`](DETECCION_AMENAZAS.md) | **Mapa honesto**: qué detecta hoy y qué queda fuera |
| [`WALLET-SECURITY-BOUNDARIES.md`](WALLET-SECURITY-BOUNDARIES.md) | Fronteras de la postura de wallets, matriz de la familia y backlog de integración |
| [`ONCHAIN-ANALYTICS.md`](ONCHAIN-ANALYTICS.md) | **Los 15 indicadores de inteligencia**: umbral, evidencia y falsos positivos |
| [`RISK-MODEL.md`](RISK-MODEL.md) | Cómo se calcula el puntaje explicable y qué no significa |
| [`BLOCKCHAIN-FORENSICS.md`](BLOCKCHAIN-FORENSICS.md) | Grafo, seguimiento de fondos y límites del análisis |
| [`INVESTIGATION-GUIDE.md`](INVESTIGATION-GUIDE.md) | Flujo de trabajo del analista, de la ingesta al informe |
| [`DATA-GOVERNANCE.md`](DATA-GOVERNANCE.md) | Qué datos entran, cuánto se conservan y cómo se gobiernan |
| [`THREAT_MODEL.md`](THREAT_MODEL.md) | Amenazas consideradas y explícitamente fuera de alcance |
| [`POLITICA_DE_PRIVACIDAD_LOCAL.md`](POLITICA_DE_PRIVACIDAD_LOCAL.md) | Qué datos toca, dónde quedan y cómo comprobarlo |
| [`LICENCIA_Y_DECISION.md`](LICENCIA_Y_DECISION.md) | Por qué MIT, qué se pierde con ello y qué implica para un fork |
| [`RECLUTADORES.md`](RECLUTADORES.md) | Qué capacidades demuestra este repositorio y dónde mirarlas |
| [`../SECURITY.md`](../SECURITY.md) | Frontera de confianza y cómo reportar una vulnerabilidad |
| [`FAMILIA_ROOTCAUSE.md`](FAMILIA_ROOTCAUSE.md) | Las seis ediciones RootCause y cuál usar en cada caso |
| [`INTEGRATION-ROOTCAUSE.md`](INTEGRATION-ROOTCAUSE.md) | Encaje técnico con el resto de la familia |
| [`ROADMAP.md`](ROADMAP.md) | Estado actual y evolución prevista |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Historial de versiones |

## Las puertas que respaldan lo anterior

Ningún documento de este repositorio es la última palabra sobre sí mismo. Cada
afirmación importante tiene un script que la comprueba y un job de CI que la
ejecuta:

| Afirmación | Quién la verifica |
|---|---|
| «Cero dependencias, cero orígenes remotos, cero proveedores alojados» | `scripts/check-local-only.js` |
| «No acepta claves ni credenciales; el RPC es de solo lectura y local por defecto» | `scripts/check-security-claims.js` |
| «Las reglas del motor están en el catálogo, la política y el README» | `scripts/check-rule-coverage.js` |
| «Los 15 indicadores tienen umbral, falsos positivos, acción y documentación» | `scripts/check-rule-coverage.js` |
| «Ningún puntaje se emite sin explicación, límites y revisión humana» | `scripts/check-security-claims.js` |
| «El grafo aplica sus cotas y la API de riesgo rechaza material privado» | `scripts/check-security-claims.js` |
| «Ningún documento enlaza a un archivo inexistente» | `scripts/check-docs.js` |
| «La presentación publicada tiene las láminas, los minutos y los anexos que anuncia el README» | `scripts/check-presentation.js` |
| «La aplicación empaquetada arranca y sirve inventario» | job `app-windows` de `.github/workflows/ci.yml` |

Ejecutar todas a la vez:

~~~bash
pnpm check
~~~
