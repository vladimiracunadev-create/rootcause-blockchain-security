# Aplicación de Windows

RootCause Blockchain Security se distribuye como aplicación de escritorio para
Windows en dos formatos, ambos con el mismo contenido:

| Formato | Archivo | Cuándo usarlo |
| --- | --- | --- |
| Instalador | `RootCause-Blockchain-Security-<versión>-win-x64-setup.exe` | Uso normal. Instala por usuario, sin permisos de administrador, y crea accesos directos. |
| Portable | `RootCause-Blockchain-Security-<versión>-win-x64-portable.zip` | Equipos donde no se instala software, auditoría, o uso desde una unidad extraíble. |

Ninguno de los dos requiere tener Node.js instalado: el motor oficial viaja
dentro, verificado por SHA-256 contra `SHASUMS256.txt` de nodejs.org en el
momento de empaquetar. El hash queda registrado en `BUILD-INFO.json`, dentro del
propio paquete.

## Qué ve el usuario

1. Ejecuta **RootCause Blockchain Security** (acceso directo o `.cmd`).
2. Se abre una ventana de consola con la dirección del panel y se lanza el
   navegador por defecto en `http://127.0.0.1:8790`.
3. Cierra la ventana de consola para detener la aplicación.

El navegador se abre solo si la variable `ROOTCAUSE_OPEN_BROWSER` vale `1`, cosa
que hace el lanzador de escritorio y nadie más. Un despliegue de servidor nunca
lanza un navegador, y la apertura se bloquea si el proceso no está escuchando en
una dirección de loopback. Eso está cubierto por `test/desktop-launch.test.js`.

## Dónde queda cada cosa

| Contenido | Ruta |
| --- | --- |
| Programa (instalado) | `%LOCALAPPDATA%\Programs\RootCause Blockchain Security` |
| Configuración del usuario | `%LOCALAPPDATA%\RootCause\blockchain-security\config.cmd` |
| Estado cifrado | `%LOCALAPPDATA%\RootCause\blockchain-security\data` |

El programa y los datos viven separados a propósito: desinstalar no borra el
estado cifrado, y actualizar no lo pisa.

### Configuración

`config.cmd` es un archivo de variables que el lanzador ejecuta antes de
arrancar. Ejemplo completo:

~~~bat
set "DEMO_MODE=false"
set "ROOTCAUSE_DATA_KEY=clave-generada-con-generar-clave-de-datos"
set "PORT=8790"
set "EVM_RPC_URL=http://127.0.0.1:8545"
set "EVM_EXPECTED_CHAIN_ID=1"
set "WATCHTOWER_ENABLED=true"
~~~

Si `DEMO_MODE=false` y falta `ROOTCAUSE_DATA_KEY`, el lanzador se detiene y
explica cómo generarla en vez de arrancar sin cifrado.

Un endpoint RPC remoto necesita además `EVM_ALLOW_REMOTE_RPC=true`. No es una
traba burocrática: el proveedor al que consultes ve qué contratos vigilas.

## Construir los artefactos

Requisitos: Windows con PowerShell 5.1 o superior. Para el instalador, además,
Inno Setup 6 (`choco install innosetup`).

~~~powershell
# Icono multirresolución, generado desde código
powershell -File packaging/windows/make-icon.ps1

# Edición portable: descarga y verifica node.exe, ensambla y comprime
powershell -File packaging/windows/build-portable.ps1

# Instalador (reutiliza la carpeta ensamblada por el paso anterior)
iscc /DAppVersion=0.2.0 packaging/windows/RootCause-Blockchain-Security.iss
~~~

Atajo para los dos primeros pasos:

~~~bash
pnpm package:windows
~~~

`build-portable.ps1` acepta `-NodeVersion 22.23.2` para fijar el runtime exacto
y hacer reproducible la compilación; sin ese parámetro resuelve la última LTS de
la rama indicada en `-NodeMajor`.

## Qué se verifica antes de publicar

Un paquete que pesa lo esperado no prueba nada. La cadena de verificación es:

1. **Al empaquetar** — `build-portable.ps1` arranca la aplicación *con el
   `node.exe` empaquetado* y ejecuta `scripts/check-security-claims.js`: si el
   paquete no sirviera el panel, arrancara sin inventario o dejara de rechazar
   material secreto, el ZIP no llega a crearse.
2. **En CI, cada push** — el job `app-windows` empaqueta, ejecuta el lanzador
   `.cmd` real y comprueba `/api/health`, el título del panel y que
   `/api/summary` devuelva inventario. Una aplicación que abre vacía es el fallo
   que nadie detecta a tiempo.
3. **En cada release** — el job de `.github/workflows/release-windows.yml`
   instala el `.exe` en silencio, arranca la aplicación *instalada* y repite la
   comprobación de inventario antes de subir nada.
4. **Integridad** — `SHA256SUMS.txt` acompaña a cada release, y el ZIP portable
   lleva además su propio `.sha256`.

Para verificar una descarga:

~~~powershell
Get-FileHash .\RootCause-Blockchain-Security-0.2.0-win-x64-setup.exe -Algorithm SHA256
~~~

## Publicar una versión

~~~bash
# 1. subir la versión en package.json y CHANGELOG.md
# 2. crear y empujar el tag; el workflow hace el resto
git tag v0.2.0
git push origin v0.2.0
~~~

El workflow rechaza el tag si no coincide con la versión de `package.json`, de
modo que no puede publicarse un `v0.2.0` que por dentro dice `0.1.0`.

## Mantenimiento del runtime

Empaquetar Node significa hacerse cargo de él. Cuando Node publique una versión
de seguridad de la rama incluida, hay que republicar la aplicación aunque el
código propio no haya cambiado:

1. `powershell -File packaging/windows/build-portable.ps1 -NodeVersion <nueva>`;
2. subir la versión en `package.json` y `CHANGELOG.md`;
3. crear el tag `vX.Y.Z`; el workflow hace el resto.

El motivo de asumir este coste, y las condiciones bajo las cuales dejaría de
merecer la pena, están en
[ADR-0001](ADR-0001-plataforma-y-lenguaje.md).

## Limitaciones conocidas

- Solo x64. No se publica compilación ARM64 todavía.
- Los binarios no están firmados con certificado de código: SmartScreen puede
  advertir en la primera ejecución. La verificación disponible hoy es el hash
  publicado.
- El instalador no registra la aplicación como servicio ni la añade al arranque:
  es deliberado, el watchtower solo corre mientras el panel está abierto. Para
  vigilancia continua, el camino soportado hoy es el despliegue self-hosted con
  `compose.yaml`.
