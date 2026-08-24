# Runbook de incidente blockchain

1. Congela cambios operativos fuera del proceso de emergencia.
2. Confirma chain ID, bloque y hash en al menos dos observadores independientes.
3. Preserva logs, transaction hash, log index, bytecode y artefactos de build.
4. Clasifica el evento: clave, upgrade, oracle, bridge, contrato, dependencia o
   infraestructura de observación.
5. Evalúa exposición actual sin usar una clave sospechosa.
6. Si existe un mecanismo de pausa, ejecuta el procedimiento humano aprobado,
   con simulación y doble control.
7. Rota roles o migra control desde firmantes independientes.
8. Comunica hechos confirmados; separa claramente hipótesis.
9. Reanuda solo después de verificar estado, controles y monitorización.
10. Documenta la causa sistémica y agrega una prueba o regla preventiva.

Nunca pegues secretos en RootCause ni en tickets de incidente.

---

## Runbooks de postura de wallets

RootCause **detecta y documenta**; nunca ejecuta ninguno de estos
procedimientos. Toda remediación on-chain (revocar, rotar, migrar) la firma un
humano desde un entorno independiente del posiblemente comprometido.

Los ocho pasos comunes, aplicables a todos los runbooks de esta sección:

1. **Validación independiente:** confirma el hecho en al menos dos fuentes
   (nodo propio + explorador u otro observador).
2. **Preservación de evidencia:** conserva chain ID, bloque, transaction hash,
   log index y el incidente exportado, antes de tocar nada.
3. **Contención fuera del dispositivo sospechoso:** ninguna acción desde la
   máquina, navegador o wallet potencialmente comprometidos.
4. **Simulación previa:** simula cada transacción de remediación antes de
   firmarla (fork local o herramienta de simulación).
5. **Doble control humano:** dos personas revisan la transacción de
   remediación antes de emitirla.
6. **Rotación o revocación desde un entorno independiente:** hardware limpio,
   red distinta, firmantes no expuestos.
7. **Verificación posterior:** vuelve a consultar el estado on-chain en dos
   fuentes y confirma que la exposición cerró.
8. **Causa raíz documentada:** registra qué política falló y añade la regla o
   prueba preventiva.

### Exposición de allowance (`BLK-WALLET-001`)

- Enumera todos los allowances activos de la cuenta, no solo el reportado.
- Prioriza revocar los ilimitados y los de tokens con más saldo.
- Reemplaza aprobaciones ilimitadas por montos acotados con vencimiento.

### Spender desconocido (`BLK-WALLET-002`)

- Identifica el contrato spender: bytecode, despliegue, verificación de fuente.
- Si nadie del equipo lo reconoce, trátalo como hostil: revoca primero,
  investiga después.
- Si es legítimo, regístralo en la allowlist con propósito y responsable.

### Operador NFT no autorizado (`BLK-WALLET-003`)

- Distingue `ApprovalForAll` (toda la colección) de la aprobación de un token.
- Revoca el operador global antes que cualquier otra acción.
- Inventaria qué activos pudieron transferirse desde la aprobación.

### Permit sospechoso (`BLK-WALLET-004`)

- El permit consumido ya es un allowance: sigue el runbook de exposición de
  allowance para revocarlo.
- Investiga **dónde se firmó**: la captura de la firma es dominio de Web
  Inspector (dApp falsa) o del Inspector de endpoint (malware).
- Asume que pueden existir más firmas off-chain no usadas: rotar la cuenta
  puede ser más seguro que revocar una a una.

### Address poisoning (`BLK-WALLET-005`)

- No transfieras nada: el ataque solo funciona si alguien copia la dirección.
- Marca la dirección similar como hostil en la libreta local y avisa a todos
  los operadores de la cuenta.
- Revisa las salidas recientes por si alguna ya usó la dirección envenenada;
  si ocurrió, trata el caso como robo consumado y documenta.

### Cambio de propietario o guardián (`BLK-WALLET-006`)

- Congela el uso operativo de la smart account hasta confirmar el origen.
- Si el cambio no fue aprobado, asume compromiso del quorum: migra fondos y
  roles con los firmantes que sigan confiables.
- Si fue legítimo, registra la aprobación con hash para que el patrón quede
  auditado.

### Módulo desconocido (`BLK-WALLET-006`, `changeKind: module-enabled`)

- Un módulo tiene poder total sobre la cuenta: trátalo como owner hostil.
- Deshabilita el módulo desde el quorum legítimo tras simular la transacción.
- Audita qué ejecutó el módulo mientras estuvo habilitado.

### Delegación EIP-7702 inesperada (`BLK-WALLET-007`)

- Verifica el código delegado (`0xef0100` + dirección) en dos fuentes.
- Si la delegación no fue intencional, la clave de la EOA debe considerarse
  comprometida: vacía y abandona la cuenta desde un entorno limpio.
- Si es de diseño, registra la implementación esperada en la política.

### Wallet administrativa posiblemente comprometida (`BLK-WALLET-008`, reactivación)

- No uses la clave sospechosa ni para «comprobar».
- Ejecuta la migración de roles y fondos con los firmantes no expuestos.
- Coordina con los Inspectors de endpoint para revisar los dispositivos que
  custodiaban la clave.

### Actividad anómala (`BLK-WALLET-008`, red/ventana/contraparte)

- Confirma con los operadores si la actividad fue intencional antes de
  escalar.
- Si nadie la reconoce, escala al runbook de wallet comprometida.
- Si el patrón operativo cambió de verdad, actualiza la política declarada.
