# 17 · Resumen ejecutivo

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

| | |
|---|---|
| **Sistema** | RootCause Blockchain Security |
| **Versión** | 0.3.0 · commit `6d96e71` |
| **Fecha del análisis** | 27 de agosto de 2026 |
| **Licencia** | MIT |
| **Estado** | Funcional y completo en su alcance actual. Todas las puertas de calidad en verde |

---

## Qué es

Una **aplicación de escritorio** que vigila aplicaciones y cuentas de blockchain
para detectar fallos de control **antes** de que se conviertan en pérdidas, y para
investigar el movimiento de fondos cuando algo ya ocurrió.

Tiene tres características que la definen y que conviene entender juntas:

1. **Solo observa.** No custodia claves privadas, no firma nada y no mueve
   fondos. No es una limitación de configuración: la capacidad no existe en el
   código.
2. **Todo ocurre en la máquina del operador.** Sin nube, sin cuenta, sin
   telemetría. Los datos no salen, y por lo tanto ningún tercero se entera de qué
   se vigila ni de qué se investiga.
3. **Explica en lugar de sentenciar.** Cada detección incluye qué se observó, por
   qué es un problema, qué política incumple, qué evidencia lo respalda, cómo
   podría ser una falsa alarma y qué pasos dar. La decisión siempre es humana.

---

## Qué necesidad cubre

Las grandes pérdidas de este sector rara vez vienen de romper la criptografía.
Vienen de **fallos de control**: una cuenta antigua que seguía siendo
administradora, un oráculo de precios que dejó de actualizarse, un puente cuyos
tres firmantes estaban en el mismo proveedor, o un permiso de gasto concedido una
vez y nunca retirado.

Ese tipo de fallo tiene tres propiedades que lo hacen tratable:

- es **estructural**, así que se puede describir con reglas deterministas y no
  con modelos probabilísticos;
- es **observable en público**, así que no hace falta ningún dato privado ni
  ninguna clave;
- se detecta **antes** del impacto, así que existe una ventana de respuesta.

El producto cubre exactamente esa ventana.

---

## Quién lo utiliza

| Perfil | Uso |
|---|---|
| Equipo de seguridad de un protocolo | Inventariar, detectar fallas de control, revisar incidentes |
| Tesorería u operaciones | Vigilar cuentas públicas propias: autorizaciones de gasto, cambios de configuración, actividad fuera de patrón |
| Analista de investigación | Reconstruir el movimiento de fondos tras un incidente, con evidencia sellada |
| Auditoría interna | Verificar la cadena de auditoría y la integridad de la evidencia |
| Otro producto de la familia RootCause | Consultar riesgo de una dirección por una API local versionada |

---

## Capacidades principales

| Capacidad | Alcance actual |
|---|---|
| **Inventario multi-chain** | Contratos, oráculos, puentes, gobernanza y dependencias, con criticidad y entorno |
| **Detección determinista** | **22 reglas** agrupadas en **13 controles** |
| **Postura de wallets** | **8 reglas** sobre cuentas públicas: allowances, operadores NFT, permits, smart accounts, delegaciones EIP-7702 y actividad |
| **Vigilancia del observador** | 3 reglas: si el nodo cae, apunta a otra red o se atrasa, eso es un incidente |
| **Inteligencia on-chain** | **15 indicadores** en 6 familias, sobre Bitcoin y Ethereum |
| **Puntaje explicable** | Nunca viaja sin sus factores, su confianza y sus limitaciones |
| **Grafo de fondos** | Seguimiento, caminos, ciclos, comunidades y proximidad, siempre acotado |
| **Casos y evidencia** | Expediente con evidencia sellada por hash e informe exportable |
| **Auditoría verificable** | Cadena de hashes que detecta manipulación |
| **API local** | 15 rutas internas + **25 rutas versionadas** `/api/v1` |

---

## Tecnologías

| Elemento | Elección | Consecuencia |
|---|---|---|
| Lenguaje | JavaScript ESM sobre Node.js ≥ 22.12 | Sin compilación: **lo que se audita es lo que se ejecuta** |
| Dependencias de terceros | **Cero** | Superficie de cadena de suministro nula |
| Servidor, criptografía, HTTP, pruebas | Biblioteca estándar de Node | Sin árbol de dependencias que mantener |
| Interfaz | HTML, CSS y JavaScript sin framework | Instalable como PWA, sin CDN |
| Persistencia | Un archivo cifrado con AES-256-GCM | Sin base de datos que operar |
| Empaquetado | ZIP autocontenido con el runtime oficial verificado por SHA-256 | Se descomprime y funciona: sin instalar Node, sin permisos de administrador |
| CI | GitHub Actions con acciones fijadas a commit | 6 puertas de calidad por cambio |

**Por qué importa la cifra de cero dependencias.** No es una postura estética.
Elimina de raíz la clase de riesgo que más incidentes ha producido en el
desarrollo moderno —el paquete comprometido en la cadena de suministro— y
convierte el mantenimiento a largo plazo en algo predecible: no hay 400
dependencias transitivas que actualizar. Y está **verificado por un gate**: si
alguien añade una, el build falla.

---

## Arquitectura, en cinco líneas

Una capa HTTP que escucha solo en la máquina local; dos routers —uno interno,
otro versionado para integraciones—; servicios de caso de uso que son los únicos
que escriben estado; un dominio puro donde viven las reglas, los indicadores, el
grafo y el puntaje; y una infraestructura que solo aporta cifrado, hashing y un
cliente JSON-RPC de solo lectura. Nada baja de capa hacia arriba y el dominio no
conoce ni disco ni red.

El detalle está en [03 · Arquitectura](03-architecture.md).

---

## Estado actual · medido, no estimado

Todo lo siguiente se ejecutó sobre el commit analizado el 27 de agosto de 2026:

| Indicador | Resultado |
|---|---|
| Pruebas automatizadas | **144 pasan, 0 fallan, 0 omitidas** |
| Invariantes de seguridad comprobados **arrancando la aplicación real** | **51** |
| Archivos validados por el linter propio | 153 |
| Reglas coherentes entre motor, catálogo, política y README | 22 · 13 controles |
| Indicadores coherentes con umbral, falsos positivos y documentación | 15 · 6 familias |
| Referencias de documentación verificadas | 373 en 37 documentos |
| Plataformas cubiertas por CI | Windows, Linux y macOS × Node 22 y 24 |
| Escenarios reproducibles incluidos | 10 datasets + 9 escenarios de wallet |

---

## Fortalezas

**1. Las promesas de seguridad son ejecutables, no declarativas.**
Es lo más distintivo del proyecto. «No acepta claves privadas» no es una frase
del README: son siete comprobaciones que arrancan la aplicación real y lo
intentan de siete formas distintas. Lo mismo con «el RPC es de solo lectura»,
«cero dependencias» y «el puntaje nunca va solo». Para un auditor eso cambia el
trabajo: en vez de verificar afirmaciones a mano, se verifica que los gates
comprueban lo que dicen, y se ejecutan.

**2. Honestidad epistémica como propiedad del sistema.**
El producto distingue explícitamente entre hecho observado, indicador,
inferencia e hipótesis, y **se niega estructuralmente** a producir identidades
verificadas. Cada indicador declara sus falsos positivos posibles; cada puntaje
declara sus limitaciones; cada agrupación advierte de que no acredita
titularidad. En un dominio donde la sobreinterpretación tiene consecuencias
legales y reputacionales, esto es una ventaja competitiva real, no un detalle.

**3. La documentación no puede envejecer en silencio.**
Un gate comprueba que ningún documento enlaza a un archivo inexistente; otro,
que toda regla del motor está en el catálogo, en la política y en el README;
otro, que la presentación publicada coincide con lo que anuncia el README.

**4. Riesgo de operación muy bajo.**
Sin base de datos que administrar, sin dependencias que parchear, sin servicio que
mantener disponible. La instalación es descomprimir un ZIP.

**5. Calidad del código sostenida.**
Determinismo obligatorio en todos los recorridos, cotas explícitas en todo lo que
puede crecer, rechazo en el borde en lugar de saneamiento, y aritmética entera
para todos los montos. Los comentarios explican el **porqué** —incluidas las
decisiones incómodas— en lugar de repetir el código.

**6. Prueba de artefacto real, no solo de compilación.**
CI empaqueta la aplicación de Windows, **la arranca con el runtime empaquetado**
y comprueba que sirve el panel con inventario dentro. Un ZIP del tamaño correcto
no prueba que la aplicación funcione: ese es exactamente el fallo que nadie
detecta a tiempo.

---

## Riesgos

Del análisis salieron **25 hallazgos**: 0 críticos, 6 altos, 10 medios y 9 bajos.
Ninguno compromete las promesas centrales del producto. Los tres que conviene
resolver antes de usar el sistema con datos reales:

| # | Riesgo | Por qué importa |
|---|---|---|
| **R-01** | El sistema no detecta que un colector dejó de enviar datos | Un panel en verde puede significar «todo bien» o «nadie está mirando», y desde dentro no hay forma de distinguirlo. Es la peor clase de falso negativo: uno que tranquiliza |
| **R-02** | No hay bloqueo entre procesos sobre el archivo de estado | Dos instancias sobre el mismo directorio pueden perder escrituras en silencio |
| **R-03** | No hay procedimiento de respaldo ni rotación de la clave de cifrado | Perder la clave hace el estado irrecuperable, sin excepción |

El resto son limitaciones de escala —el grafo se reconstruye en cada consulta,
algunos arrays crecen sin cota, no hay paginación— y de higiene —una versión
escrita a mano, configuración declarada y no leída, dos archivos que git trata
como binarios por un byte nulo—. El registro completo, con evidencia y
recomendación, está en
[15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

### Límites del producto, que no son riesgos sino alcance

Conviene que quien decida sobre él los conozca:

- **No analiza el bytecode de un contrato.** Un inventario limpio no demuestra
  que un contrato esté libre de vulnerabilidades.
- **No observa el mempool.** Solo ve lo ya confirmado.
- **No consulta reputación externa**, y es deliberado: hacerlo revelaría a un
  tercero qué se está investigando.
- **No atribuye identidad a una dirección.** Nunca.
- **No ejecuta la respuesta.** Detecta y explica; contener es una decisión humana
  con otras herramientas.
- **No sigue fondos entre redes automáticamente.** La correlación cross-chain
  requiere verificación manual.

---

## Oportunidades de mejora

| Oportunidad | Valor | Esfuerzo |
|---|---|---|
| Vigilar el silencio de los colectores (R-01) | **Alto** — cierra el hueco de detección más importante | Bajo: encaja en el modelo de reglas existente |
| Documentar respaldo y añadir rotación de clave (R-03) | **Alto** — elimina un riesgo de pérdida total | Bajo |
| Bloqueo de instancia única (R-02) | Alto | Bajo |
| Conectar el soporte de Bitcoin ya implementado | **Alto** — el conector existe pero no está cableado; ampliaría el alcance sin escribir el núcleo | Bajo |
| Pruebas de `mergeIncidents` y del puntaje | Medio — cubren los dos módulos más visibles sin cobertura directa | Bajo |
| Medición de cobertura en CI | Medio | Muy bajo: Node ya lo trae, sin añadir dependencias |
| Caché del grafo y paginación | Medio — solo relevante si crece el volumen | Medio |
| Integración con el resto de la familia RootCause | **Alto en producto** | Medio-alto |

---

## Próximos pasos recomendados

**Corto plazo — antes de usarlo con datos reales**

1. Resolver R-01, R-02 y R-03.
2. Sustituir la política de demostración de `config/policies.json` por las
   políticas de los activos que la organización usa de verdad.
3. Ajustar `wallet.allowedChainIds` a las redes que se operan realmente: dejarlo
   por defecto produce alertas en actividad legítima, y una herramienta que grita
   sin motivo se acaba ignorando.

**Medio plazo — próxima versión**

4. Higiene: versión desde `package.json`, truncado de lote explícito, aviso al
   exponer fuera de loopback, escapes en lugar de bytes nulos.
5. Cerrar los huecos de prueba prioritarios y activar la medición de cobertura.
6. Decidir el futuro del conector de Bitcoin: conectarlo o marcarlo como
   previsto.

**Largo plazo — producto**

7. Integración efectiva con el resto de la familia RootCause.
8. Evaluar si el volumen real exige revisar la decisión de almacenamiento; el
   ADR-0002 ya define cuándo hacerlo.

---

## Valoración final

Es un producto **coherente**: cada decisión técnica se sostiene sobre la
propuesta de valor, y cada afirmación importante tiene un mecanismo que la
verifica. La disciplina de cero dependencias, la frontera epistémica explícita y
los invariantes ejecutables no son adornos: son lo que hace que el producto pueda
usarse en un contexto donde equivocarse tiene consecuencias.

Los riesgos encontrados son de operación y de escala, no de diseño, y todos
tienen una solución conocida y proporcionada. Ninguno exige rediseñar nada.

La recomendación es: **resolver los tres riesgos de prioridad 1, calibrar las
políticas para el entorno real, y entonces sí usarlo con datos de producción.**

---

## Documentos relacionados

- [01 · Descripción general del sistema](01-system-overview.md)
- [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md)
- [`../RECLUTADORES.md`](../RECLUTADORES.md) — qué capacidades demuestra el repositorio
- [`../ROADMAP.md`](../ROADMAP.md)
- [`../FAMILIA_ROOTCAUSE.md`](../FAMILIA_ROOTCAUSE.md)
<!-- navegacion -->
---

**[← 16 · Glosario](16-glossary.md)** · **[Índice](README.md)** · **[18 · Guía para un nuevo desarrollador →](18-new-developer-guide.md)**
