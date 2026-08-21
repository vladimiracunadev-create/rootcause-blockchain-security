# CI/CD en GitHub

Cuatro workflows, todos con actions **pinneadas a commit SHA**, permisos
mínimos, `concurrency` y timeouts explícitos. Ninguno ejecuta `npm ci` ni
`pnpm install`: este repositorio no tiene dependencias a propósito, así que CI
nunca toca la red de un registro de paquetes.

| Workflow | Cuándo corre | Qué protege |
|---|---|---|
| `ci.yml` | push y PR a `main`, manual | Las seis puertas de calidad |
| `codeql.yml` | push, PR, lunes 06:41 UTC, manual | Análisis estático del código propio |
| `release-windows.yml` | tag `v*`, manual | Que un tag no publique un artefacto roto |
| `deploy-landing.yml` | cambios en `landing/` o `docs/img/`, manual | Que la página de producto no salga con huecos |

## `ci.yml` — las seis puertas

| Job | Qué tumba el build |
|---|---|
| **calidad** | Un test roto, en cualquiera de 6 combinaciones: Windows, Linux y macOS × Node 22 y 24 |
| **solo-local** | Una dependencia npm, un CDN en el panel, un proveedor RPC alojado, una CSP abierta. Verificado además por una segunda vía independiente (`npm ls`) |
| **invariantes** | Que la aplicación acepte material secreto, permita mutaciones sin cabecera local, admita RPC remoto por defecto, o que aparezca un método JSON-RPC de firma en `src/` |
| **reglas** | Que el motor emita un código ausente del catálogo, la política o el README |
| **app-windows** | Que el paquete de escritorio no arranque, o arranque **sin inventario** |
| **documentacion** | Un enlace a un documento inexistente |

El job **app-windows** es el que más veces evita un desastre silencioso:
empaqueta la aplicación, ejecuta el `.cmd` **real** que usa el usuario y
comprueba `/api/health`, el título del panel y que `/api/summary` devuelva
inventario. Un ZIP del tamaño esperado no prueba que la aplicación funcione.

## `codeql.yml`

`security-extended` sobre JavaScript. Corre también semanalmente porque las
consultas de CodeQL mejoran aunque el código no cambie.

## `release-windows.yml`

Orden deliberado: **primero las puertas, después el empaquetado**. Un tag no
puede publicar un artefacto que no superó los invariantes.

1. Las cinco verificaciones de calidad.
2. **Coherencia de versión**: el tag debe coincidir con `package.json`. Impide
   publicar un `v0.2.0` que por dentro dice `0.1.0`.
3. Icono, portable e instalador Inno Setup.
4. **Instalación silenciosa y arranque de la aplicación instalada**, con
   comprobación de que sirve inventario.
5. `SHA256SUMS.txt`.
6. Release creado con `gh` y el token del propio workflow — sin actions de
   terceros.

`workflow_dispatch` permite ensayar el empaquetado completo sin crear un tag:
construye y verifica, pero no publica.

## `deploy-landing.yml`

El sitio se **ensambla**, no se sube tal cual: las capturas viven una sola vez
en `docs/img` (donde las usa el README) y se copian al construir. Antes de
publicar comprueba dos cosas:

- que ninguna imagen referenciada falte —una landing con un hueco gris es la
  primera impresión del producto—;
- que ninguna imagen se quede sin texto alternativo.

## Dependabot

Solo vigila GitHub Actions, que es el único código de terceros que se ejecuta
en este proyecto. Los PR llegan **agrupados** a propósito:

- `github/codeql-action*` sube junto, porque `init` y `analyze` son el mismo
  action: un PR que moviera solo uno dejaría el workflow con dos versiones
  incompatibles y CodeQL fallaría sin que nadie hubiera roto nada;
- `actions/*` sube junto por el mismo motivo de coherencia.

## Reproducir CI en local

~~~bash
pnpm check
~~~

Y el equivalente del job de Windows:

~~~powershell
powershell -File packaging/windows/make-icon.ps1
powershell -File packaging/windows/build-portable.ps1
~~~

## Pinneo a SHA

Todas las actions se referencian por commit SHA con el número de versión en un
comentario al lado:

~~~yaml
uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v4.3.0
~~~

Un tag de Git se puede mover; un SHA no. Es la diferencia entre confiar en que
el mantenedor no reescriba `v4`, y no tener que confiar.
