# La familia RootCause

Seis ediciones, una misma idea, superficies distintas.

## La idea común

> Cualquier distorsión anómala de los recursos, la configuración o el control
> puede ser el primer indicio de que algo está ocurriendo.

Todas las ediciones comparten posicionamiento —**sensor forense y de apoyo a la
decisión, no antivirus ni custodio**—, arquitectura por capas, análisis local
sin telemetría y la misma disciplina de entrega: CI sin tolerancia, evidencia
exportable y honestidad explícita sobre los límites.

## Dos líneas de producto

La familia se divide en dos líneas porque responden a preguntas distintas.

### Línea Inspectors — «¿este dispositivo se está comportando raro?»

| Edición | Plataforma | Tecnología | Repositorio |
|---|---|---|---|
| **Windows Inspector** | Windows 10/11 | Rust + egui | [rootcause-windows-inspector](https://github.com/vladimiracunadev-create/rootcause-windows-inspector) |
| **macOS Inspector** | macOS 13+ | Rust + egui | [rootcause-macos-inspector](https://github.com/vladimiracunadev-create/rootcause-macos-inspector) |
| **Web Inspector** | Navegador | Extensión MV3 + Node | [rootcause-web-inspector](https://github.com/vladimiracunadev-create/rootcause-web-inspector) |
| **Mobile Inspector** | Android / iOS | Flutter | [rootcause-mobile-inspector](https://github.com/vladimiracunadev-create/rootcause-mobile-inspector) |

Observan **una máquina**: persistencia, defensas del sistema, procesos, red,
permisos. La unidad de riesgo es el dispositivo.

### Línea Digital Assets — «¿este sistema de valor está bien controlado?»

| Edición | Dominio | Tecnología | Repositorio |
|---|---|---|---|
| **Bitcoin Defense** | UTXO, wallets, firmantes, PSBT, Bitcoin Core | Node sin dependencias | [rootcause-bitcoin-defense](https://github.com/vladimiracunadev-create/rootcause-bitcoin-defense) |
| **Blockchain Security** | Contratos, proxies, oráculos, puentes, gobernanza | Node sin dependencias | [rootcause-blockchain-security](https://github.com/vladimiracunadev-create/rootcause-blockchain-security) |

Observan **un sistema de control**: quién puede firmar, quién puede actualizar,
qué depende de qué. La unidad de riesgo no es la máquina sino la arquitectura de
privilegios. Aquí el activo se pierde sin que nadie toque tu equipo.

## Qué observa cada una

| Superficie | Windows | macOS | Web | Mobile | Bitcoin | Blockchain |
|---|---|---|---|---|---|---|
| Persistencia | Registro Run, servicios, tareas | LaunchAgents, login items | Extensiones | Inicio automático | — | — |
| Defensas del sistema | Defender, firewall | Gatekeeper, SIP, XProtect | Permisos de sitio | Permisos de app | — | — |
| Procedencia | Authenticode | `codesign` | — | — | Firmware del firmante | Bytecode y compilación |
| Privilegios | UAC | TCC | — | Permisos concedidos | Multisig y quorum | Admin, proxy, upgrade, timelock |
| Dependencias externas | — | — | — | — | — | Oráculos, puentes, librerías |
| Fuente de hechos | Sistema local | Sistema local | Navegador | Sistema Android | Bitcoin Core (RPC lectura) | Nodo EVM (JSON-RPC lectura) |
| Evidencia | JSON, SQLite, ETL | JSON, SQLite, Markdown | Panel local | PDF | Auditoría encadenada | Auditoría encadenada |

## Por qué no son el mismo código

Traducir el producto entre superficies sin traducir el dominio produciría una
herramienta que compila en todas partes y no dice nada útil en ninguna. En macOS
la persistencia son archivos `.plist`, no claves de registro. Y en una cadena
programable el riesgo no es un proceso raro: es que una EOA olvidada siga siendo
`owner` de un proxy que mueve el dinero de todos.

Lo que **sí** se comparte:

- El modelo de **incidente** con severidad, causa raíz, evidencia y acción
  recomendada.
- La regla de **diagnóstico primero, intervención después**: ninguna edición
  ejecuta la respuesta por ti.
- La estructura de **documentación** y el criterio de honestidad sobre los
  límites.
- La disciplina de entrega: puertas de CI que verifican los claims, no que los
  repitan.

## Cuál usar

- **Un equipo Windows o Mac que va raro** → la edición nativa correspondiente.
- **Sospechas centradas en el navegador** → Web Inspector.
- **Un teléfono con consumo raro o sospecha de stalkerware** → Mobile Inspector.
- **Custodias bitcoin y quieres saber si tus claves nacieron bien** → Bitcoin
  Defense.
- **Operas contratos, un puente o una tesorería on-chain** → Blockchain
  Security.

Se complementan. Un operador de protocolo que responde un incidente suele
necesitar dos a la vez: **Blockchain Security** le dice que un rol crítico está
en una EOA, y **Windows Inspector** le dice si la máquina desde la que se firma
está limpia.

## Diferencias conocidas entre ediciones

Documentadas en vez de disimuladas:

- **Licencia.** La línea Inspectors usa Apache 2.0; la línea Digital Assets usa
  MIT. Conviene unificarlas cuando se decida la política definitiva del
  portafolio.
- **Cobertura de landing.** Todas las ediciones publican página de producto en
  GitHub Pages salvo Bitcoin Defense, que todavía no la tiene.
- **Madurez de release.** Las ediciones de escritorio publican binarios
  verificados; Web y Mobile publican por sus propios canales.

## Detalle de esta edición

Ver [`../README.md`](../README.md), [`ARCHITECTURE.md`](ARCHITECTURE.md) y
[`ADR-0001-plataforma-y-lenguaje.md`](ADR-0001-plataforma-y-lenguaje.md).
