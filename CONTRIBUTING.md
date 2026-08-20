# Contribuir

1. No agregues funciones de firma, custodia o transmisión de transacciones.
2. Mantén los adaptadores de cadena detrás de interfaces de solo lectura.
3. Toda regla debe incluir evidencia, causa raíz, severidad y remediación.
4. Agrega una prueba que falle antes del cambio y pase después.
5. Ejecuta `pnpm check` antes de abrir un cambio.

No incluyas direcciones privadas de infraestructura, credenciales ni datos de
clientes en ejemplos, pruebas o reportes.

## Cero dependencias

Este repositorio no instala paquetes de terceros, y eso es una decisión de
producto, no una casualidad: la aplicación audita cadenas de suministro ajenas
y no puede arrastrar la suya. `pnpm check:local-only` tumba el build si aparece
una dependencia, un CDN en el dashboard o un proveedor RPC alojado en el código.

Si necesitas una capacidad que parece exigir una librería, la vía correcta es
proponerla primero en un issue: casi siempre existe un builtin de `node:` que la
cubre.

## Añadir una regla

Una regla nueva toca cuatro sitios, y `pnpm check:rules` no deja olvidarse de
ninguno:

1. `src/domain/rule-engine.js` — la detección, con su código `BLK-*`.
2. `config/control-catalog.json` — el control al que pertenece.
3. `config/policies.json` — el listado de reglas y, si aplica, su umbral.
4. `README.md` — la fila en la tabla de reglas.

Además, una prueba en `test/rule-engine.test.js` que la dispare y otra que
compruebe que no dispara cuando no debe.

## Cambiar la postura de seguridad

`scripts/check-security-claims.js` arranca la aplicación real y verifica los
seis principios del README. Si un cambio lo hace fallar, la respuesta por
defecto es corregir el cambio, no relajar el gate. Relajarlo requiere explicar
en el PR qué promesa del README deja de ser cierta y actualizar el README en el
mismo commit.

## Empaquetado de Windows

Los artefactos de escritorio se construyen desde `packaging/windows/`. Nada
binario se versiona: el icono se genera desde código y el `node.exe` se descarga
y se verifica por SHA-256 al empaquetar. Detalles en
[docs/WINDOWS-APP.md](docs/WINDOWS-APP.md).
