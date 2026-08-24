# Requisitos

## Para usar la aplicación

### Windows (recomendado)

| Requisito | Detalle |
|---|---|
| Sistema | Windows 10 o 11, x64 |
| Node.js | **No hace falta.** El motor oficial viaja dentro del paquete |
| Permisos | Ninguno especial: el instalador es por usuario, sin UAC |
| Espacio | ~90 MB instalado (~32 MB el ZIP portable) |
| Navegador | Cualquiera moderno, para el panel local |
| Red | Ninguna. La aplicación no sale a Internet |

No se publica compilación ARM64 todavía.

### Otros sistemas

El código corre igual en Linux y macOS —el empaquetado es lo único específico de
Windows—, pero ahí hay que ejecutarlo desde el código fuente:

| Requisito | Detalle |
|---|---|
| Node.js | 22.12 o superior |
| pnpm | 11 (opcional: `node src/server.js` funciona igual) |

### Opcional: observador de cadena

| Requisito | Detalle |
|---|---|
| Nodo EVM | Cualquiera que hable JSON-RPC sobre HTTP: Geth, Erigon, Reth, Nethermind, Besu, Anvil |
| Acceso | Solo lectura. La aplicación no puede invocar métodos de firma |
| Ubicación | Localhost por defecto; remoto exige `EVM_ALLOW_REMOTE_RPC=true` |

Sin nodo la herramienta funciona: evalúa el inventario declarado. Con nodo,
además vigila la cadena y las tres reglas `BLK-NODE-*` cobran sentido.

### Opcional: otras cadenas

Solana, Cosmos, Substrate y cualquier otra red no necesitan soporte del
producto: un adaptador externo envía hechos ya normalizados a
`POST /api/observe/event`. El requisito es que ese adaptador exista y hable el
contrato de [`API.md`](API.md).

## Para desarrollar

| Requisito | Versión | Por qué |
|---|---|---|
| Node.js | 22.12+ | `node --test`, `node:crypto`, `AbortSignal.timeout` |
| pnpm | 11 | Declarado en `packageManager`. No instala nada: el repo no tiene dependencias |
| Git | Cualquiera | — |

**No hay dependencias de terceros y no debe haberlas.** `pnpm check:local-only`
tumba el build si aparece una. Ver [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## Para construir la aplicación de Windows

| Requisito | Detalle |
|---|---|
| Windows | Con PowerShell 5.1 o superior |
| Conexión a Internet | Solo al empaquetar: descarga el `node.exe` oficial y verifica su SHA-256 |
| Inno Setup 6 | Solo para el instalador: `choco install innosetup` |

El icono no requiere nada: se genera desde código con GDI+.

~~~powershell
powershell -File packaging/windows/make-icon.ps1
powershell -File packaging/windows/build-portable.ps1
iscc /DAppVersion=0.2.0 packaging/windows/RootCause-Blockchain-Security.iss
~~~

## Para el despliegue self-hosted

| Requisito | Detalle |
|---|---|
| Docker | Con Compose v2 |
| Clave de datos | `ROOTCAUSE_DATA_KEY` en el entorno, nunca en la imagen |
| Red | Aislamiento y autenticación por delante: la aplicación no trae login |

Es el camino soportado para vigilancia continua, ya que el watchtower de
escritorio solo corre mientras el panel está abierto. Ver
[`ADR-0001`](ADR-0001-plataforma-y-lenguaje.md), sección 2.2.

## Requisitos de conocimiento

Honestamente: esta herramienta **asume un operador técnico**. Para sacarle
partido hay que saber responder cosas como:

- quién es `owner` de cada contrato que operas, y si eso es una EOA, un multisig
  o un timelock;
- qué oráculos consume tu aplicación y con qué heartbeat;
- qué puentes usas, con qué quorum y si sus operadores son realmente
  independientes.

Si esas preguntas no tienen respuesta hoy, la herramienta sigue siendo útil —
**hacer el inventario ya descubre la mitad de los problemas**—, pero el trabajo
real es contestarlas, no instalar el programa.
