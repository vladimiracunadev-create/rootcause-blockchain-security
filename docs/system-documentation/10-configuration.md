# 10 · Configuración

> Versión analizada: `0.3.0` · Commit `6d96e71` · Fecha: 2026-08-27
> [← Volver al índice](README.md)

## Dónde vive la configuración

| Nivel | Archivo | Se lee | Cambiar exige |
|---|---|---|---|
| **Entorno** | `.env.example` como plantilla; el proceso lee `process.env` | Al arrancar, en `loadConfig` | Reiniciar |
| **Política de defensa** | `config/policies.json` | Al arrancar, en `buildRuntime` | Reiniciar |
| **Catálogo de controles** | `config/control-catalog.json` | Al arrancar | Reiniciar |
| **Catálogo de indicadores** | `config/intelligence-indicators.json` | Al arrancar | Reiniciar |
| **Política de inteligencia** | `config/intelligence-policies.json` | Al arrancar | Reiniciar |
| **Editor** | `.editorconfig` | Herramientas | — |
| **Git** | `.gitattributes`, `.gitignore` | git | — |
| **Contenedor** | `Dockerfile`, `compose.yaml` | Docker | — |

**Hecho verificado** — los cuatro JSON de `config/` se leen **una sola vez**, con
un `Promise.all` en `buildRuntime`. No hay recarga en caliente: modificar una
política y no reiniciar deja el proceso evaluando con la anterior. Es una
consecuencia fácil de olvidar en operación.

---

## Variables de entorno, una por una

### `HOST` — interfaz de escucha

- **Por defecto:** `127.0.0.1`.
- **Efecto:** además de determinar dónde escucha, condiciona la apertura del
  navegador: `openBrowserIfRequested` **solo** abre si el host es loopback.
- **Si se configura mal:** poner `0.0.0.0` expone a la red local una API **sin
  autenticación** que permite registrar proyectos, aprobar hashes de cambio y
  leer el inventario completo. La cabecera `x-rootcause-request` no es una
  credencial: cualquier cliente que no sea un navegador la añade sin esfuerzo.
- **Recomendación:** dejarlo en loopback. Si hace falta acceso remoto, poner
  delante un proxy inverso con autenticación real y TLS.

### `PORT`

- **Por defecto:** `8790`. Rango forzado 0 – 65535; `0` pide un puerto efímero,
  que es lo que usan las pruebas.
- **Si se configura mal:** un valor fuera de rango **no falla**, se acota. Un
  puerto ocupado sí falla, con `EADDRINUSE`.

### `DEMO_MODE`

- **Por defecto:** `true`.
- **Efecto en cadena:** elige `MemoryStore` frente a `EncryptedFileStore`,
  `createDemoState()` frente a `createEmptyState()`, y activa la precarga de seis
  datasets de inteligencia con su análisis.
- **Si se configura mal:** dejarlo en `true` con datos reales significa que
  **nada se guarda**: al cerrar el proceso se pierde todo el trabajo. El modo
  aparece en el arranque, en `/api/health`, en `/api/summary` y en el panel, así
  que el error es visible —pero solo si alguien mira.
- **Detalle:** solo la cadena `"true"` (sin distinguir mayúsculas) cuenta como
  verdadero. `DEMO_MODE=1` es `false`.

### `DATA_DIR`

- **Por defecto:** `./data`, resuelto a absoluto.
- **Efecto:** `dataFile` es siempre `<DATA_DIR>/state.enc.json`. El nombre del
  archivo no es configurable.
- **Si se configura mal:** una ruta sin permisos de escritura hace fallar la
  primera mutación, no el arranque.

### `ROOTCAUSE_DATA_KEY` — la variable sensible

- **Por defecto:** vacía.
- **Formato:** 32 bytes, en hexadecimal de 64 caracteres o en base64.
  `decodeDataKey` rechaza cualquier otra longitud.
- **Generación:** `node scripts/generate-key.js`.
- **Obligatoria** si `DEMO_MODE=false`: `assertProductionConfig` impide arrancar
  sin ella.
- **Si se configura mal o se pierde:** el estado cifrado es **irrecuperable**.
  No hay recuperación de AES-256-GCM. Si se cambia por otra clave, el arranque
  falla al descifrar —el tag GCM no valida— y el error **se propaga**, que es lo
  correcto: arrancar vacío borraría el inventario en silencio.
- **Manejo:** gestor de secretos o variable de entorno del proceso. **Nunca** en
  la línea de comandos (queda en el historial), nunca en un archivo versionado.
  `.gitignore` excluye `.env` y `scripts/validate-repo.js` falla si detecta
  material privado en cualquier archivo de texto del repositorio.

### `REQUEST_BODY_LIMIT_BYTES`

- **Por defecto:** `131072` (128 KB). Rango 1024 – 1 048 576.
- **Si se configura mal:** demasiado bajo rechaza inventarios grandes con 413;
  demasiado alto amplía la memoria que una petición puede forzar antes de ser
  rechazada.

### `RATE_LIMIT_PER_MINUTE`

- **Por defecto:** `120`. Rango 10 – 10 000.
- **Consideración:** el panel hace varias peticiones por recarga. Bajarlo mucho
  puede provocar 429 en uso normal.
- **Limitación conocida:** ventana fija, no deslizante; en el peor caso admite el
  doble del límite en un minuto que cruce el borde de dos ventanas.

### `EVM_RPC_URL`

- **Por defecto:** `http://127.0.0.1:8545`.
- **Validación en el constructor**, es decir, al arrancar: URL parseable,
  protocolo http o https, **sin credenciales embebidas**, y loopback salvo
  permiso explícito.
- **Si se configura mal:** la aplicación **no arranca**. Es intencionado: un
  observador mal configurado es peor que ninguno, porque produce hechos falsos.

### `EVM_EXPECTED_CHAIN_ID`

- **Por defecto:** `"1"` (Ethereum mainnet).
- **Efecto:** se compara con el `eth_chainId` observado. Si no coinciden se emite
  `BLK-NODE-002`, de severidad **crítica**.
- **Si se configura mal:** un incidente crítico permanente, o —peor— la ausencia
  de él cuando el nodo sí está en la red equivocada.

### `EVM_ALLOW_REMOTE_RPC` — la variable de mayor consecuencia

- **Por defecto:** `false`.
- **Qué desbloquea:** un endpoint RPC que no sea loopback.
- **Consecuencia de ponerlo a `true`:** el proveedor del endpoint ve **todas** las
  consultas: qué contratos se inspeccionan, qué direcciones se vigilan y con qué
  frecuencia. Es exactamente el tipo de filtración que el producto evita por
  diseño en todo lo demás.
- **Recomendación:** dejarlo en `false` y usar un nodo propio. Si hay que
  activarlo, que sea una decisión consciente y documentada.

### `EVM_RPC_TIMEOUT_MS`

- **Por defecto:** `5000`. Rango 500 – 60 000.
- **Si se configura mal:** demasiado bajo produce `BLK-NODE-001` intermitentes
  —ruido—; demasiado alto retiene peticiones HTTP y ciclos del watchtower.

### `EVM_RPC_RESPONSE_LIMIT_BYTES`

- **Por defecto:** `2097152` (2 MB). Rango 1024 – 16 777 216.
- **Efecto:** corta la lectura **mientras** llega, sin materializar la respuesta
  entera.
- **Si se configura mal:** demasiado bajo hace fallar `eth_getBlockByNumber` en
  bloques grandes; demasiado alto permite que un nodo averiado consuma memoria.

### `WATCHTOWER_ENABLED` y `WATCHTOWER_INTERVAL_MS`

- **Por defecto:** `false` y `15000`. Intervalo entre 5000 y 3 600 000.
- **Efecto:** cada ciclo hace `refreshNode` + `scan`, ambas **mutaciones**: cada
  ciclo escribe el estado y añade dos entradas de auditoría.
- **Si se configura mal:** un intervalo muy corto multiplica el ruido de
  auditoría y el desgaste de disco. La guarda de reentrada evita el solapamiento,
  pero no el volumen.

### `ROOTCAUSE_OPEN_BROWSER`

- **Por defecto:** `"0"`. Solo el lanzador de escritorio lo pone a `"1"`.
- **Doble condición:** aunque valga `"1"`, no abre nada si el bind no es
  loopback.

### `ROOTCAUSE_CHROME`

- **Uso:** herramientas de generación de PDF.
- **Detalle:** si apunta a un ejecutable que no existe, el error se lanza **de
  inmediato**, para que no aparezca más tarde disfrazado de «el navegador no
  publicó su puerto de depuración».

---

## Configuración de política · `config/policies.json`

### Umbrales de nivel superior

| Clave | Valor | Regla afectada |
|---|---|---|
| `version` | `2026-08-24` | Trazabilidad |
| `minimumUpgradeDelaySeconds` | `86400` (24 h) | `BLK-UPGRADE-001` |
| `minimumGovernanceTimelockSeconds` | `172800` (48 h) | `BLK-GOV-001` |
| `maximumObserverLagBlocks` | `8` | `BLK-NODE-003` |
| `abnormalOutflowUsd` | `250000` | `BLK-FUNDS-001` |
| `minimumOracleProviders` | `2` | `BLK-ORACLE-001` |
| `minimumBridgeIndependentOperators` | `3` | `BLK-BRIDGE-001` |
| `minimumBridgeThresholdRatio` | `0.6667` (≈ 2 de 3) | `BLK-BRIDGE-001` |
| `rules[]` | Los 22 códigos | Verificado por el gate de cobertura |

### Bloque `wallet`

| Clave | Valor por defecto | Efecto |
|---|---|---|
| `maximumAllowanceAgeDays` | `90` | Edad máxima de un allowance sin política de activo |
| `maximumOperatorAgeDays` | `90` | Equivalente para operadores |
| `dormancyDays` | `30` | Referencia de dormancia |
| `allowedChainIds` | `["1", "11155111"]` | Mainnet y Sepolia |
| `operatingWindow` | `null` | Ventana horaria global |
| `authorizedSpenders` | `[]` | Se suma a los de cada cuenta |
| `authorizedOperators` | `[]` | Ídem |
| `knownCounterparties` | `[]` | Ídem |
| `defaultDustThresholdRaw` | `"0"` | Umbral de dust por defecto |
| `assetPolicies[]` | 1 entrada de demostración | Límite y edad por token |
| `poisoning.minimumPrefixMatch` | `4` | Caracteres de prefijo compartidos |
| `poisoning.minimumSuffixMatch` | `4` | Caracteres de sufijo |
| `poisoning.minimumSignals` | `2` | Señales exigidas |

> **Advertencia de calibración.** `allowedChainIds` incluye `"1"` y `"11155111"`
> por defecto. Una organización que opere en otras redes verá `BLK-WALLET-008`
> por «red no autorizada» en actividad perfectamente legítima hasta que ajuste
> la lista. Es el ejemplo más claro de que **un umbral mal calibrado produce
> falsos positivos, no seguridad** —lo dice el propio archivo de política de
> inteligencia.

> **Nota sobre la política de demostración.** `assetPolicies[]` trae una entrada
> con el token ficticio `DEMO-STABLE` y la dirección
> `0x00000000000000000000000000000000000a11ce`. Es un placeholder para que el
> modo demostración tenga contra qué comparar. **Requiere validación**: en un
> despliegue real hay que sustituirlo por las políticas de los activos que la
> organización usa de verdad.

---

## Configuración de inteligencia · `config/intelligence-policies.json`

### Umbrales por indicador

Cada uno de los 15 indicadores tiene su bloque. Ejemplos:

| Indicador | Umbrales |
|---|---|
| `INT-FLOW-001` | `minimumSources: 8`, `windowHours: 24` |
| `INT-FLOW-003` | `minimumHops: 3`, `maximumMinutesBetweenHops: 30`, `minimumValueRetainedPercent: 50` |
| `INT-FLOW-004` | `minimumLinks: 3`, `minimumRemainderPercent: 70`, `maximumPeelPercent: 30` |
| `INT-BEHAV-001` | `dormantDays: 60`, `burstTransfers: 3`, `burstWindowHours: 24` |
| `INT-BEHAV-002` | `minimumRepeats: 4`, `amountTolerancePercent: 5`, `windowHours: 48` |
| `INT-EXPO-002` | `minimumPrefixMatch: 4`, `minimumSuffixMatch: 4`, `dustThresholdRaw: "1000"` |
| `INT-ASSET-001` | `minimumFlowSharePercent: 85`, `minimumTransfers: 5` |
| `INT-BRIDGE-001` | `minimumBridges: 2`, `windowHours: 6` |
| `INT-EXPLOIT-001` | `windowHours: 72` |

`scripts/check-rule-coverage.js` exige que **todo** indicador del catálogo tenga
umbral, y que **todo** umbral corresponda a un indicador del catálogo.

### Bloque `scoring`

| Clave | Valor |
|---|---|
| `bands` | `low 0-24`, `moderate 25-49`, `high 50-74`, `critical 75-100` |
| `severityWeights` | `critical:40, high:26, medium:14, low:6` |
| `repetitionBonusPerExtraHit` | `3`, con tope `maximumRepetitionBonus: 12` |
| `proximity.pointsByDistance` | `0:30, 1:18, 2:10, 3:5, 4:2` |
| `proximity.maximumDistance` | `4` |
| `sourceReliabilityPenalty.maximumPenalty` | `15` |
| `evidenceAge.halfLifeDays` | `90` |
| `evidenceAge.maximumDecayPercent` | `60` |
| `mitigatingFactors` | `-12` etiquetada, `-8` historial largo, `-10` revocada, `-6` señal única débil |
| `confidence.minimumIndicatorsForHigh` | `3` |
| `confidence.minimumReliabilityForHigh` | `0.75` |
| `confidence.minimumReliabilityForMedium` | `0.5` |

### Bloque `graph`

`defaultDepth: 3`, `maximumDepth: 6`, `maximumNodes: 2000`,
`maximumEdges: 8000`. Estos valores se pasan a `graph.js`, que los vuelve a
acotar contra `GRAPH_LIMITS`: **una configuración no puede superar la cota
compilada.** Es defensa en profundidad.

### Bloque `api`

| Clave | Valor | Estado |
|---|---|---|
| `maximumAddressesPerRequest` | `25` | **No se lee en el código.** No hay endpoint de lote |
| `assessmentCacheSeconds` | `60` | **No se lee en el código.** No hay caché implementada |

**Hallazgo del análisis.** Ambos valores están declarados y ninguno tiene efecto.
Son intenciones documentadas en un archivo de configuración, lo que puede
inducir a error a quien audite el sistema leyendo solo la configuración.
Registrado en [15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

---

## Diferencias entre entornos

| Aspecto | Desarrollo | Pruebas | Producción de escritorio | Contenedor |
|---|---|---|---|---|
| Arranque | `node --watch src/server.js` | `node --test` | `RootCause….cmd` o `node src/server.js` | `docker compose up` |
| `DEMO_MODE` | `true` | `true` mayoritariamente | `false` | `true` |
| Almacén | memoria | memoria | archivo cifrado | memoria |
| `HOST` | `127.0.0.1` | `127.0.0.1` | `127.0.0.1` | `0.0.0.0` dentro, publicado solo en loopback |
| `PORT` | `8790` | `0` (efímero) | `8790` | `8790` |
| Watchtower | desactivado | desactivado | opcional | desactivado |
| Navegador | manual | no | automático | no |

**Hecho verificado** — el repositorio **no tiene** archivos de configuración por
entorno. Todo se resuelve con variables de entorno, que es coherente con una
aplicación de escritorio de un solo despliegue.

---

## Banderas de funcionalidad

No hay sistema de *feature flags* como tal. Lo más parecido son tres
interruptores de entorno:

| Bandera | Activa |
|---|---|
| `DEMO_MODE` | Datos de demostración y almacén en memoria |
| `WATCHTOWER_ENABLED` | Vigilancia periódica |
| `EVM_ALLOW_REMOTE_RPC` | Endpoint RPC no local |
| `ROOTCAUSE_OPEN_BROWSER` | Apertura del navegador |

---

## Configuraciones sensibles

| Elemento | Sensibilidad | Manejo correcto |
|---|---|---|
| `ROOTCAUSE_DATA_KEY` | **Máxima** | Gestor de secretos. Nunca en git, nunca en la línea de comandos |
| `EVM_RPC_URL` con credenciales | Alta | **Rechazado por el código.** Usa un nodo sin autenticación en loopback |
| `data/state.enc.json` | Alta | Cifrado en reposo; el respaldo hereda la protección, pero es inútil sin la clave |
| `config/policies.json` | Media | Revela el modelo de riesgo de la organización |
| `HOST` | Media | Cambiarlo a `0.0.0.0` es una decisión de seguridad, no de comodidad |

**Verificación de ausencia de secretos:**

~~~bash
node scripts/validate-repo.js
~~~

Falla si detecta un bloque PEM de clave privada o una clave extendida en
cualquier archivo de texto del repositorio. Resultado del 27 de agosto de 2026:
`Repository validation passed for 153 files.`

---

## Resumen de consecuencias por configuración incorrecta

| Error | Consecuencia | Visibilidad |
|---|---|---|
| `DEMO_MODE=true` con datos reales | Pérdida total al cerrar | Alta: se anuncia en 4 sitios |
| `HOST=0.0.0.0` sin proxy | API sin autenticación expuesta | **Baja: nada avisa** |
| Pérdida de `ROOTCAUSE_DATA_KEY` | Estado irrecuperable | Alta al arrancar |
| `EVM_ALLOW_REMOTE_RPC=true` | El proveedor ve qué se vigila | **Ninguna** |
| `EVM_EXPECTED_CHAIN_ID` erróneo | `BLK-NODE-002` permanente o ausente | Alta |
| `allowedChainIds` sin ajustar | `BLK-WALLET-008` en actividad legítima | Media |
| Política editada sin reiniciar | Se evalúa con la anterior | **Ninguna** |
| `RATE_LIMIT_PER_MINUTE` muy bajo | 429 en el panel | Alta |

Las tres filas con visibilidad baja o nula son candidatas naturales a una mejora:
un aviso en el arranque cuando el bind no es loopback, cuando el RPC es remoto, o
cuando la política en disco cambió después del arranque. Recogido en
[15 · Riesgos y deuda técnica](15-risks-and-technical-debt.md).

---

## Documentos relacionados

- [02 · Instalación y ejecución](02-installation-and-execution.md)
- [11 · Seguridad](11-security.md)
- [13 · Despliegue y operación](13-deployment-and-operations.md)
- [`../COMMANDS.md`](../COMMANDS.md)
<!-- navegacion -->
---

**[← 09 · APIs e integraciones](09-apis-and-integrations.md)** · **[Índice](README.md)** · **[11 · Seguridad →](11-security.md)**
