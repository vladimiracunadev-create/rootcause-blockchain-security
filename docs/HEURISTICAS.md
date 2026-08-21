# Heurísticas: especificación de las catorce reglas

Este documento es el contrato exacto del motor causal: qué condición dispara
cada regla, con qué severidad, qué evidencia conserva y qué remediación
propone. Está escrito para que alguien pueda **discutir un umbral** sin leer el
código, y para que quien lea el código pueda comprobar que hace lo que aquí se
dice.

Fuente de verdad: `src/domain/rule-engine.js`. Umbrales: `config/policies.json`.
Controles: `config/control-catalog.json`. Un gate de CI
(`scripts/check-rule-coverage.js`) impide que los cuatro se desincronicen.

## Cómo funciona la evaluación

1. **Determinista.** La misma entrada produce siempre el mismo conjunto de
   hallazgos. No hay muestreo, ni aleatoriedad, ni modelo estadístico.
2. **Identidad estable.** El `id` de un hallazgo es
   `sha256(código | entidad | proyecto)` truncado a 20 caracteres. El mismo
   problema en la misma entidad no genera un incidente nuevo en cada análisis:
   se reconoce como el mismo.
3. **Sin efectos.** Evaluar no escribe en cadena, no llama a terceros y no
   modifica el inventario.

### Severidad

La severidad no está fijada por regla, sino **derivada de la criticidad del
proyecto** que declaraste en el inventario:

| Criticidad del proyecto | Reglas «graves» | Reglas «normales» |
|---|---|---|
| `critical` o `high` | `critical` | `high` |
| `medium` o `low` | `high` | `medium` |

Tres reglas ignoran esa escala y son **siempre `critical`**, porque describen
un hecho ya ocurrido y no una condición latente: `BLK-EVENT-001`,
`BLK-FUNDS-001` y `BLK-NODE-002`.

La consecuencia es intencionada: **el mismo defecto pesa distinto según lo que
proteja.** Un admin en una EOA sobre un contrato de laboratorio es `high`;
sobre la tesorería es `critical`.

## Umbrales configurables

Todos viven en `config/policies.json` y son ejemplos: **deben adaptarse al
riesgo real del sistema**.

| Clave | Valor por defecto | Usada por |
|---|---|---|
| `minimumUpgradeDelaySeconds` | 86 400 (24 h) | `BLK-UPGRADE-001` |
| `minimumGovernanceTimelockSeconds` | 172 800 (48 h) | `BLK-GOV-001` |
| `minimumOracleProviders` | 2 | `BLK-ORACLE-001` |
| `minimumBridgeThresholdRatio` | 0,6667 (2 de 3) | `BLK-BRIDGE-001` |
| `minimumBridgeIndependentOperators` | 3 | `BLK-BRIDGE-001` |
| `abnormalOutflowUsd` | 250 000 | `BLK-FUNDS-001` |
| `maximumObserverLagBlocks` | 8 | `BLK-NODE-003` |

---

## Reglas de inventario

Se evalúan sobre lo que declaraste en el proyecto. No requieren nodo.

### BLK-CONTRACT-001 · Fuente desplegada sin procedencia verificada

- **Control:** `SC-PROVENANCE` · **Entidad:** contrato
- **Dispara si:** `verifiedSource` es falso.
- **Causa raíz:** la entrega no conserva evidencia suficiente para reproducir el
  bytecode desplegado.
- **Evidencia:** proyecto, chain ID, dirección, `verifiedSource`, `bytecodeHash`.
- **Remediación:** publicar o registrar fuente, configuración de compilador y
  hash del artefacto; comparar bytecode de runtime antes de aceptar una versión.

> **Límite honesto:** que la fuente esté verificada no significa que sea
> correcta. Esta regla mide *trazabilidad*, no *corrección*.

### BLK-ACCESS-001 · Admin crítico controlado por una EOA

- **Control:** `ADMIN-CONTAINMENT` · **Entidad:** contrato · **Severidad:** grave
- **Dispara si:** `admin.type === "eoa"`.
- **Causa raíz:** el plano de control carece de quorum y separación de funciones.
- **Remediación:** migrar el rol a multisig o gobernanza con firmantes
  independientes; añadir timelock, alertas y procedimiento probado de emergencia.

> Es la regla que más incidentes reales explica: no hace falta romper la
> criptografía si una sola clave puede cambiarlo todo.

### BLK-ACCESS-002 · Multisig administrativo con umbral débil

- **Control:** `ADMIN-CONTAINMENT` · **Entidad:** contrato
- **Dispara si:** el admin es `multisig` y `threshold < 2`, o `threshold > owners`
  (un umbral inalcanzable es tan defectuoso como uno trivial).
- **Causa raíz:** el multisig no aporta quorum real.

### BLK-UPGRADE-001 · Upgrade sin demora mínima

- **Control:** `ADMIN-CONTAINMENT` · **Entidad:** contrato
- **Dispara si:** `upgradeable` y
  `upgradeDelaySeconds < minimumUpgradeDelaySeconds`.
- **Causa raíz:** un upgrade puede ejecutarse sin ventana de detección ni
  reacción.
- **Evidencia:** incluye el valor observado y el mínimo de política, para que la
  discusión sea sobre números y no sobre impresiones.

### BLK-ORACLE-001 · Oráculo concentrado y sin fallback

- **Control:** `ORACLE-RESILIENCE` · **Entidad:** oráculo · **Severidad:** grave
- **Dispara si:** `providerCount < minimumOracleProviders` **y**
  `fallbackAvailable` es falso.
- **Nota sobre la conjunción:** pocos proveedores *con* fallback declarado no
  dispara. Es deliberado: la regla penaliza la ausencia de alternativa, no el
  número en sí.

### BLK-ORACLE-002 · Feed vencido respecto de su heartbeat

- **Control:** `ORACLE-RESILIENCE` · **Entidad:** oráculo
- **Dispara si:** no hay `lastUpdateAt` válido, o `heartbeatSeconds` no es
  positivo, o han pasado **más del doble del heartbeat** desde la última
  actualización.
- **Causa raíz:** la aplicación puede consumir un dato económico que ya no
  representa el mercado.
- **Por qué el doble:** un solo heartbeat perdido es ruido operativo normal; dos
  consecutivos ya no lo son.

### BLK-BRIDGE-001 · Puente con quorum u operadores insuficientes

- **Control:** `BRIDGE-QUORUM` · **Entidad:** puente · **Severidad:** grave
- **Dispara si:** `threshold / signerCount < minimumBridgeThresholdRatio`
  **o** `independentOperators < minimumBridgeIndependentOperators`.
- **Causa raíz:** la seguridad cross-chain depende de un conjunto de validación
  demasiado concentrado.

> **Límite honesto:** «independiente» es un dato que **tú declaras**. El producto
> no puede comprobar que tres firmantes no comparten proveedor de nube, jurisdicción
> o persona. Si mientes en ese campo, la regla te dará la razón.

### BLK-GOV-001 · Timelock de gobernanza inferior a política

- **Control:** `GOVERNANCE-DELAY` · **Entidad:** proyecto
- **Dispara si:** el modelo de gobernanza no es `none` y
  `timelockSeconds < minimumGovernanceTimelockSeconds`.

### BLK-SUPPLY-001 · Dependencia no fijada o sin procedencia

- **Control:** `SUPPLY-CHAIN` · **Entidad:** dependencia
- **Dispara si:** `pinned` es falso **o** `provenanceVerified` es falso.
- **Causa raíz:** el build puede incorporar código distinto del revisado sin una
  señal confiable.

---

## Reglas de evento

Se evalúan sobre hechos enviados a `POST /api/observe/event`. Son las únicas que
describen algo que **ya pasó**, y por eso son siempre `critical`.

### BLK-EVENT-001 · Cambio privilegiado sin aprobación registrada

- **Control:** `CHANGE-APPROVAL` · **Entidad:** evento de cadena
- **Dispara si:** el evento es `privileged_role_change` y su `approvalHash` no
  coincide con ninguna aprobación registrada previamente.
- **Por qué por hash:** que alguien afirme que el cambio estaba aprobado no es
  evidencia. La aprobación tiene que existir **antes**, con su hash SHA-256, en
  el registro local.

### BLK-FUNDS-001 · Salida de valor anómala no aprobada

- **Control:** `VALUE-EGRESS` · **Entidad:** evento de cadena
- **Dispara si** se cumplen **las tres** condiciones:
  1. el evento es `value_outflow` y **no** está marcado como aprobado;
  2. `amountUsd >= abnormalOutflowUsd`;
  3. `amountUsd` **quintuplica** al menos la línea base declarada.
- **Por qué tres condiciones:** un umbral absoluto solo produce falsos positivos
  en protocolos grandes, y un múltiplo de la línea base solo, en protocolos
  pequeños. Exigir ambos reduce el ruido sin perder el caso que importa.

---

## Reglas del observador

Vigilan la **fuente de los hechos**. Un observador ciego no es un detalle
técnico: es la diferencia entre «no hay incidentes» y «no me estoy enterando».

### BLK-NODE-001 · Observador RPC no disponible

- **Control:** `OBSERVER-INTEGRITY` · **Severidad:** `high`
- **Dispara si:** el nodo no está conectado.

### BLK-NODE-002 · RPC conectado al chain ID equivocado

- **Control:** `OBSERVER-INTEGRITY` · **Severidad:** `critical` siempre
- **Dispara si:** el `chainId` observado difiere del `expectedChainId`.
- **Por qué crítico:** estás mirando **otra cadena**. Todo lo que veas es cierto
  y a la vez irrelevante, que es la peor combinación posible.

### BLK-NODE-003 · Observador atrasado

- **Control:** `OBSERVER-INTEGRITY` · **Severidad:** `high`
- **Dispara si:** el atraso en bloques supera `maximumObserverLagBlocks`.

---

## Qué NO hace ninguna regla

- **No lee el bytecode ni lo analiza.** No hay decompilación, ni simulación, ni
  verificación formal. Las reglas evalúan *controles declarados y hechos
  observados*, no la semántica del contrato.
- **No consulta reputación externa.** No hay listas de direcciones maliciosas ni
  servicios de terceros: eso exigiría salir a Internet y filtrar qué vigilas.
- **No infiere intención.** Un cambio privilegiado sin aprobación puede ser un
  ataque o un operador saltándose el proceso. La regla dice qué pasó; decidir
  cuál de las dos cosas es trabajo humano.
- **No pondera con IA.** La severidad sale de una tabla, no de un modelo.

## Cambiar o añadir una regla

Ver [`../CONTRIBUTING.md`](../CONTRIBUTING.md). En resumen: una regla nueva toca
el motor, el catálogo, la política y el README, y `pnpm check:rules` no deja
olvidarse de ninguno.
