# Índice de documentación

RootCause Blockchain Security — consola local watch-only para aplicaciones
blockchain. Todo lo que este repositorio afirma está verificado por un gate
ejecutable; los documentos explican el porqué.

## Para usuarios

| Documento | Contenido |
|---|---|
| [`../README.md`](../README.md) | Visión general, capturas del panel y arranque en 30 segundos |
| [`WINDOWS-APP.md`](WINDOWS-APP.md) | Instalar, configurar y verificar la aplicación de escritorio |
| [`RUNBOOK.md`](RUNBOOK.md) | Qué hacer ante un incidente, paso a paso |
| [`SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) | Antes de usarla con datos reales |
| [`BLOCKCHAIN-Y-BITCOIN.md`](BLOCKCHAIN-Y-BITCOIN.md) | Qué es cada cosa y por qué existen dos productos |

## Para desarrolladores

| Documento | Contenido |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Capas, flujo de datos y decisiones internas |
| [`API.md`](API.md) | Contrato HTTP completo de la API local |
| [`ADR-0001-plataforma-y-lenguaje.md`](ADR-0001-plataforma-y-lenguaje.md) | Por qué escritorio y no SaaS; por qué Node hoy, Rust después y no Go |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Cero dependencias, cómo añadir una regla, cómo tocar la postura de seguridad |

## Seguridad y producto

| Documento | Contenido |
|---|---|
| [`THREAT_MODEL.md`](THREAT_MODEL.md) | Amenazas consideradas y explícitamente fuera de alcance |
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
| «Ningún documento enlaza a un archivo inexistente» | `scripts/check-docs.js` |
| «La aplicación empaquetada arranca y sirve inventario» | job `app-windows` de `.github/workflows/ci.yml` |

Ejecutar todas a la vez:

~~~bash
pnpm check
~~~
