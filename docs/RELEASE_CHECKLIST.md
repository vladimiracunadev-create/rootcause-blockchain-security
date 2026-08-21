# Checklist de release

Cada paso con su comando de verificación. La regla de la casa: **nada se marca
como hecho sin haberlo comprobado con un comando real.**

## Antes del tag

| # | Paso | Verificación |
|---|---|---|
| 1 | Todas las puertas en verde en local | `pnpm check` |
| 2 | Versión subida en `package.json` | `node -p "require('./package.json').version"` |
| 3 | Entrada nueva en `CHANGELOG.md` con esa versión | `head -12 CHANGELOG.md` |
| 4 | El paquete portable se construye y arranca | `pnpm package:windows` |
| 5 | `main` limpio y empujado | `git status --short` |
| 6 | CI en verde en el commit que vas a etiquetar | `gh run list --workflow ci.yml --limit 1` |

Si el paso 4 falla, **no sigas**: el mismo script corre en CI y volverá a
fallar, pero habiendo consumido ya el tag.

## Crear el tag

~~~bash
git tag v0.1.0
git push origin v0.1.0
~~~

El workflow **rechaza el tag si no coincide con `package.json`**. Es la red que
impide publicar un `v0.2.0` que por dentro dice `0.1.0`.

## Qué hace el workflow por ti

No hace falta comprobarlo a mano, pero conviene saber qué se está verificando:

1. Las cinco puertas de calidad, **antes** de empaquetar nada.
2. Coherencia entre el tag y `package.json`.
3. Descarga del `node.exe` oficial y verificación de su SHA-256 contra
   `SHASUMS256.txt` de nodejs.org.
4. Arranque de la aplicación **con el runtime empaquetado**, ejecutando los
   invariantes de seguridad.
5. Compilación del instalador con Inno Setup.
6. **Instalación silenciosa** del `.exe` y arranque de la aplicación
   *instalada*, comprobando que sirve inventario.
7. `SHA256SUMS.txt` y publicación del release.

## Después del release

| # | Paso | Verificación |
|---|---|---|
| 1 | El workflow terminó en verde | `gh run list --workflow release-windows.yml --limit 1` |
| 2 | Los tres artefactos están publicados | `gh release view v0.1.0 --json assets` |
| 3 | Los checksums son legibles | `gh release download v0.1.0 --pattern SHA256SUMS.txt` |
| 4 | La descarga real coincide con su hash | `Get-FileHash .\<archivo> -Algorithm SHA256` |
| 5 | La landing y el badge de versión del README apuntan a la versión nueva | Revisar `landing/index.html` y `README.md` |

El paso 4 es el único que prueba de verdad que un usuario puede verificar lo que
descarga. Los demás prueban que el proceso funcionó.

## Mantenimiento del runtime

Empaquetar Node significa hacerse cargo de él. Cuando Node publique una versión
de seguridad de la rama incluida hay que **republicar aunque el código propio no
haya cambiado**:

~~~powershell
powershell -File packaging/windows/build-portable.ps1 -NodeVersion <nueva>
~~~

Luego subir versión, changelog y tag como en cualquier release. El motivo de
asumir este coste está en
[`ADR-0001`](ADR-0001-plataforma-y-lenguaje.md).

## Si algo sale mal

- **El tag ya está creado y el workflow falló.** Corrige, borra el tag remoto
  (`git push --delete origin v0.1.0`), borra el local y vuelve a empezar. No
  reutilices un tag que ya publicó artefactos.
- **El release se creó pero falta un artefacto.** El paso de `SHA256SUMS.txt`
  falla si falta alguno, así que un release incompleto no debería llegar a
  existir. Si ocurre, bórralo y repite: un release a medias es peor que ninguno.
