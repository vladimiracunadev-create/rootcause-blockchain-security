# Licencia y decisión

## Qué licencia tiene

**MIT.** El texto completo está en [`../LICENSE`](../LICENSE).

En la práctica: puedes usar, copiar, modificar, integrar y redistribuir este
código, incluso en productos comerciales y cerrados, con una sola obligación —
conservar el aviso de copyright y la licencia.

## Por qué MIT y no Apache 2.0

La familia RootCause no es homogénea en esto, y conviene decirlo antes que
disimularlo: **la línea Inspectors usa Apache 2.0 y la línea Digital Assets usa
MIT.**

El razonamiento para esta línea:

1. **El valor no está en el código, está en el dominio.** Lo que hace útil a
   este repositorio son las reglas, el catálogo de controles y los runbooks. Ese
   conocimiento se difunde mejor con la licencia que menos fricción impone.
2. **Se quiere que las reglas se copien.** Si un equipo toma
   `BLK-BRIDGE-001` y lo implementa en su propio sistema de monitorización, el
   objetivo del proyecto se ha cumplido. MIT no pone ninguna traba a eso.
3. **No hay patentes que proteger.** La cláusula de concesión y represalia de
   patentes de Apache 2.0 aporta valor cuando existe una cartera de patentes en
   juego. Aquí no la hay, y su ausencia hace que la protección extra sea teórica
   mientras que el texto más largo es real.
4. **Es la licencia dominante en herramienta de seguridad blockchain.** Reduce
   la fricción de integración con el ecosistema al que este producto sirve.

### Lo que se pierde eligiendo MIT

Ser honesto también en esto:

- **Sin concesión explícita de patentes.** Apache 2.0 da al usuario una licencia
  de patente expresa; MIT no dice nada. En un ecosistema con patentes activas,
  eso importaría.
- **Sin cláusula de represalia.** Apache 2.0 retira la licencia de patente a
  quien demande por patentes; MIT no ofrece ese desincentivo.
- **Sin obligación de señalar cambios.** Un fork modificado no tiene que
  indicarlo. En una herramienta de seguridad, un fork alterado que conserve el
  nombre podría confundir a un usuario.

Ese último punto es el que más pesa en contra, y se mitiga por otra vía: los
binarios oficiales se publican con `SHA256SUMS.txt` desde CI, de modo que
cualquiera puede comprobar si lo que ejecuta es lo que este repositorio produjo.

## Pendiente de decidir en la familia

La divergencia MIT / Apache 2.0 entre las dos líneas **no es una decisión
tomada, es una decisión pendiente**. Unificarla es trabajo de la política de
portafolio, no de este repositorio. Queda anotada en
[`FAMILIA_ROOTCAUSE.md`](FAMILIA_ROOTCAUSE.md).

Cambiar la licencia de un repositorio hacia adelante es posible mientras la
titularidad esté concentrada, que hoy lo está. Cuanto más tarde se decida, más
contribuciones externas habrá que consultar.

## Marca

La licencia cubre el **código**, no el nombre. `RootCause` se usa como marca de
producto y su tratamiento —incluida la vía de registro en Chile— está
documentado en el repositorio de Windows Inspector:
[MARCA_Y_BRANDING_ROOTCAUSE](https://github.com/vladimiracunadev-create/rootcause-windows-inspector/blob/main/docs/MARCA_Y_BRANDING_ROOTCAUSE.md).

Consecuencia práctica para un fork: MIT te permite tomar el código y
redistribuirlo, pero no implica permiso para presentar tu versión **como si
fuera RootCause**. Renombra el producto si lo modificas de forma sustancial.

## Qué esperar del proyecto

- **Sin garantía.** MIT lo dice con todas las letras: el software se
  proporciona «tal cual». Esto es una herramienta de apoyo a la decisión, no un
  seguro.
- **Sin soporte comprometido.** Los issues se atienden según disponibilidad. Las
  vulnerabilidades tienen canal propio: ver [`../SECURITY.md`](../SECURITY.md).
- **Sin telemetría a cambio de gratuidad.** No hay modelo de datos detrás: ver
  [`POLITICA_DE_PRIVACIDAD_LOCAL.md`](POLITICA_DE_PRIVACIDAD_LOCAL.md).

## Contribuciones

Al abrir un cambio aceptas que se distribuya bajo MIT. No hay CLA. Las reglas de
lo que se acepta están en [`../CONTRIBUTING.md`](../CONTRIBUTING.md), y la
primera es la más importante: **no se aceptan funciones de firma, custodia o
transmisión de transacciones.** Ese límite no es negociable, porque es lo que
define al producto.
