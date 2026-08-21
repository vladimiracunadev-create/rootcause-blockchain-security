# Política de privacidad local

Qué datos toca este producto, dónde quedan y qué garantías se pueden
**comprobar en el código** en vez de creer.

## Resumen

- No hay servidor. No hay cuenta. No hay telemetría.
- Todo se ejecuta en tu máquina y escucha en `127.0.0.1`.
- La única salida de red posible es hacia el nodo JSON-RPC que tú configures, y
  por defecto ese nodo es `127.0.0.1:8545`.
- El producto **rechaza activamente** el material sensible: no es que no lo
  guarde, es que no lo acepta.

## Qué datos maneja

### Lo que sí acepta

Identificadores y metadatos **públicos** de tus aplicaciones blockchain:

- nombres de proyecto, cadena, red y chain ID;
- direcciones de contrato (públicas por definición);
- tipo de admin, número de firmantes y umbral;
- configuración de oráculos y puentes que tú declaras;
- nombres y versiones de dependencias;
- hechos on-chain observados y hashes de aprobación.

Nada de eso es secreto en el sentido criptográfico. Sigue siendo **sensible**:
en conjunto describe por dónde atacar tu sistema. Por eso se cifra en disco y
por eso no viaja a ninguna parte.

### Lo que rechaza

Claves privadas, frases semilla, mnemónicos, passphrases, keystores, WIF, claves
extendidas, PEM, tokens de acceso, credenciales de proveedor RPC, transacciones
firmadas sin publicar y URLs con credenciales incrustadas.

El rechazo es **estructural y recursivo**: `src/domain/secret-guard.js` inspecciona
el payload completo a cualquier profundidad, tanto por nombre de campo como por
patrón del contenido. Un campo prohibido a diez niveles de anidamiento se
rechaza igual, con `422 SECRET_MATERIAL_REJECTED`.

No hay forma de desactivarlo. Es el producto.

## Dónde quedan los datos

| Contenido | Ruta |
|---|---|
| Programa instalado | `%LOCALAPPDATA%\Programs\RootCause Blockchain Security` |
| Configuración del usuario | `%LOCALAPPDATA%\RootCause\blockchain-security\config.cmd` |
| Estado cifrado | `%LOCALAPPDATA%\RootCause\blockchain-security\data` |

En modo demostración **no se escribe nada en disco**: el estado vive en memoria y
desaparece al cerrar.

En modo persistente el estado se cifra con **AES-256-GCM** y la auditoría se
encadena con SHA-256, de modo que alterar una entrada pasada rompe la
verificación de la cadena.

La clave la generas tú y **no se guarda junto a los datos**. Si la pierdes, no
hay recuperación posible: no existe puerta trasera, ni siquiera para el autor.

Desinstalar **no borra** la carpeta de datos. Es deliberado: eliminar estado
cifrado sin preguntar sería una pérdida irreversible.

## Salidas de red

| Momento | Destino | Obligatoria |
|---|---|---|
| Ejecución de la aplicación | El nodo JSON-RPC configurado (por defecto `127.0.0.1:8545`) | No: sin nodo, la herramienta evalúa igual el inventario |
| Empaquetado | `nodejs.org`, para descargar y verificar el runtime | Solo al construir, nunca al usar |

**No hay ninguna otra.** Ni analítica, ni comprobación de actualizaciones, ni
listas de reputación, ni fuentes ni iconos de un CDN.

El panel se sirve con `Content-Security-Policy: default-src 'self'` y sin
`unsafe-inline`. Un gate de CI (`scripts/check-local-only.js`) tumba el build si
alguien introduce un origen externo en la interfaz o abre esa política.

### Advertencia sobre RPC remoto

Si configuras un endpoint remoto con `EVM_ALLOW_REMOTE_RPC=true`, ese proveedor
**ve qué contratos, direcciones y bloques consultas**. Eso filtra qué estás
vigilando y con qué frecuencia. Es una decisión legítima, pero consciente: la
postura por defecto es localhost precisamente por esto.

## La página de producto es otra cosa

La landing publicada en GitHub Pages **sí** carga imágenes de `img.shields.io`
para los badges de estado. Es una página web pública, no la aplicación. Si
visitas la landing, tu navegador contacta con ese servicio como con cualquier
otra web; si usas la aplicación, no.

## Garantías verificables

No hace falta creer nada de lo anterior. Cada afirmación tiene una comprobación:

| Afirmación | Cómo comprobarla |
|---|---|
| No acepta material secreto | `node scripts/check-security-claims.js` — envía claves reales y exige el rechazo |
| No hay orígenes remotos en la interfaz | `node scripts/check-local-only.js` |
| No hay dependencias de terceros | `npm ls --all` sobre el repositorio: árbol vacío |
| El RPC es de solo lectura | La allowlist se comprueba por su efecto, no por su texto |
| El bind es loopback por defecto | `loadConfig({}).host` es `127.0.0.1` |
| El watchtower no sondea sin permiso | `loadConfig({}).watchtower.enabled` es `false` |

Todas corren en CI en cada push. Un cambio que rompa cualquiera de ellas no
llega a `main`.

## Qué no cubre esta política

- **No protege frente a quien controla tu equipo.** Si tu máquina está
  comprometida, el estado cifrado se descifra con la clave que tú introduces.
  Para esa superficie está
  [RootCause Windows Inspector](https://github.com/vladimiracunadev-create/rootcause-windows-inspector).
- **No anonimiza tu actividad on-chain.** Consultar un nodo, aunque sea propio,
  deja rastro en ese nodo.
- **No sustituye las obligaciones legales** que tengas sobre los datos de tu
  organización.

Ver también [`../SECURITY.md`](../SECURITY.md) y
[`THREAT_MODEL.md`](THREAT_MODEL.md).
