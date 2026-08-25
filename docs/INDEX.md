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
