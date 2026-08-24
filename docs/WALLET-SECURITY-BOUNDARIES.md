# Fronteras de la postura de wallets

Wallet Security Posture amplía RootCause Blockchain Security para vigilar
cuentas públicas —EOA, multisig, smart accounts, tesorerías— **sin convertir el
producto en una wallet**. Este documento fija tres cosas: qué hace, qué no hará
nunca, y qué superficie corresponde a cada producto de la familia RootCause.

## La frontera no negociable

RootCause Blockchain Security **nunca**:

- solicita ni almacena frases semilla, claves privadas, keystores, PIN,
  contraseñas ni passkeys;
- recibe firmas pendientes ni almacena transacciones firmadas sin publicar;
- importa una wallet ni expone un botón «Connect Wallet»;
- usa `window.ethereum` ni integra WalletConnect;
- invoca métodos de firma ni construye, firma o transmite transacciones;
- ejecuta `approve`, `revoke`, `permit`, `pause`, `upgrade` ni transferencias;
- consulta servicios remotos de reputación de direcciones;
- afirma que una dirección es maliciosa sin evidencia suficiente;
- promete recuperación de activos;
- automatiza la respuesta on-chain.

Estas prohibiciones no son una declaración: `scripts/check-security-claims.js`
escanea el código ejecutable en busca de las capacidades vetadas
(`eth_send*`, `eth_sign*`, `personal_*`, `wallet_request*`, `wallet_add*`,
`wallet_switch*`, conexión de wallet en la interfaz) y arranca la aplicación
real para verificar que rechaza seeds, transacciones firmadas y material de
firma en cualquier profundidad. CI no deja pasar un cambio que las incumpla.

## Matriz de responsabilidad de la familia

| Superficie | Producto responsable |
| --- | --- |
| Allowances, owners, multisig, smart accounts, transferencias y cambios on-chain | RootCause Blockchain Security |
| Bitcoin, UTXO, PSBT y firmantes Bitcoin | RootCause Bitcoin Defense |
| Phishing, dominio falso, dApp falsa, extensiones y solicitudes engañosas | RootCause Web Inspector |
| Malware, portapapeles y estación de firma comprometida | RootCause Windows/macOS Inspector |
| Riesgos del dispositivo móvil, overlays y permisos | RootCause Mobile Inspector |
| Uso, respaldo, recuperación y formación del usuario | blockchain-learning-path |

Blockchain Security **no** implementa escaneo de dispositivos, navegador ni
phishing: cuando un incidente wallet sugiere una causa en otra superficie (por
ejemplo, un permit capturado en una dApp falsa), el runbook remite al producto
responsable en vez de fingir cobertura.

## Amenazas que siguen fuera de alcance

Este producto **no detecta directamente**:

- falso soporte ni ingeniería social;
- phishing antes de la firma;
- un wallet drainer antes de ejecutarse;
- blind signing en el dispositivo de firma;
- malware del portapapeles;
- robo físico del dispositivo;
- SIM swapping;
- la calidad de un respaldo;
- la exposición de una seed;
- la pérdida de una hardware wallet;
- un sitio falso o una extensión maliciosa;
- una firma off-chain todavía no utilizada.

Puede detectar algunas **consecuencias on-chain** de esas amenazas (un
allowance inesperado, un permit usado, una salida de valor), pero no afirma
haber detectado la causa sin evidencia: el incidente declara su grado de
certeza y sus limitaciones.

## Backlog de integración para los productos hermanos

Esta tarea **no modifica** los repositorios hermanos. Requisitos verificables
que quedan propuestos para cada uno:

### RootCause Web Inspector

1. Detectar solicitudes de firma EIP-712/EIP-2612 en páginas sospechosas y
   correlacionar el dominio con el permit que Blockchain Security observe usado
   on-chain (`wallet.permit.used`).
2. Exportar un hecho normalizado `web.signature-request.observed` compatible
   con el contrato de eventos de `INTEGRATION-ROOTCAUSE.md`.
3. Verificable: una prueba de integración que envía el hecho a
   `POST /api/observe/event` de este producto y comprueba la correlación.

### RootCause Windows/macOS Inspector

1. Detectar manipulación del portapapeles con direcciones EVM (patrón del
   address poisoning en el endpoint) y emitir un hecho con la dirección
   sustituida, correlacionable con `BLK-WALLET-005`.
2. Verificable: fixture con dirección envenenada → hecho normalizado → un solo
   incidente correlacionado, no dos.

### RootCause Mobile Inspector

1. Detectar overlays sobre aplicaciones de wallet y permisos de accesibilidad
   abusivos, y reportarlos como riesgo del dispositivo de firma.
2. Verificable: el reporte enlaza al runbook de wallet administrativa
   posiblemente comprometida de este producto sin duplicar la detección on-chain.

### RootCause Bitcoin Defense

1. Mantener el dominio UTXO/PSBT separado: ninguna regla `BLK-WALLET-*` aplica
   a Bitcoin y ninguna regla de Bitcoin Defense aplica a EVM.
2. Verificable: los catálogos de ambos productos no comparten códigos de regla.

### blockchain-learning-path

1. Añadir módulos sobre allowances, permits, ApprovalForAll, EIP-7702 y address
   poisoning que usen los incidentes de demo de este producto como material.
2. Verificable: cada módulo enlaza al runbook correspondiente de
   [`RUNBOOK.md`](RUNBOOK.md).

## Privacidad

La postura de wallets es local: sin analítica, telemetría, SaaS, listas remotas
de reputación ni envío de direcciones vigiladas a terceros. Las allowlists y
políticas viven en `config/policies.json` y en el estado cifrado local.

Advertencia honesta: si configuras un **proveedor RPC remoto**
(`EVM_ALLOW_REMOTE_RPC=true`), ese proveedor ve qué direcciones y contratos
consultas. La observación privada exige un nodo propio.

## Fuentes técnicas primarias

Consultadas el 2026-08-24; las características marcadas pueden evolucionar con
sus especificaciones:

- EIP-20, EIP-721, EIP-1155 (eventos `Approval`, `ApprovalForAll`, `Transfer`);
- EIP-712 y EIP-1271 (firmas estructuradas y validación por contrato);
- EIP-2612 (permit para ERC-20);
- ERC-4337 (cuentas de contrato con user operations);
- EIP-7702 (delegación de código para EOA; designator `0xef0100` + dirección);
- documentación oficial de Ethereum sobre cuentas y transacciones;
- OWASP Smart Contract Top 10 y guías Web3 Security.

Permit2 **no** está declarado como soportado: se incorporará solo cuando exista
un adaptador explícito con pruebas contra su especificación oficial.
