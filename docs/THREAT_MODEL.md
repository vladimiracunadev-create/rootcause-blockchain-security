# Modelo de amenazas

## Activos protegidos

- control administrativo y gobernanza;
- contratos y bytecode desplegado;
- fondos bloqueados o administrados por la aplicación;
- feeds de oráculos y rutas de puente;
- artefactos de compilación, dependencias y registros de despliegue;
- integridad de incidentes y auditoría.

Con Wallet Security Posture se suman como activos: las cuentas públicas
vigiladas (EOA, multisig, smart accounts, tesorerías), sus autorizaciones de
gasto (allowances, operadores, permits), la configuración de sus smart
accounts (owners, guardianes, módulos, umbrales, implementación) y sus
delegaciones EIP-7702.

## Adversarios y fallas

- robo o abuso de una clave administrativa;
- actualización maliciosa de un proxy;
- manipulación o vencimiento de oráculos;
- compromiso de un quorum de puente;
- dependencia alterada o compilación no reproducible;
- evento on-chain válido pero fuera de política;
- RPC falso, atrasado o conectado a la red equivocada;
- operador interno con privilegios excesivos;
- aprobación de gasto inducida (drainer) observable por sus efectos on-chain;
- spender u operador fuera de la política local;
- permit firmado off-chain y consumido on-chain;
- envenenamiento del historial con direcciones similares (address poisoning);
- toma de control de una smart account (owner, guardián, módulo, upgrade);
- delegación EIP-7702 no autorizada sobre una EOA vigilada;
- uso de una cuenta dormida, fuera de horario o en una red no autorizada.

## Fuera de alcance

- custodia, firma o recuperación de claves;
- bloqueo o reversión de bloques;
- prueba formal automática de contratos;
- garantía de ausencia de vulnerabilidades;
- ejecución autónoma de pausas, upgrades, revocaciones o retiros;
- conexión a wallets (`window.ethereum`, WalletConnect) y métodos de firma;
- phishing, drainers y firmas off-chain **antes** de producir efectos
  on-chain; malware, portapapeles y dispositivos: ver la matriz de
  [`WALLET-SECURITY-BOUNDARIES.md`](WALLET-SECURITY-BOUNDARIES.md).

## Amenazas propias del dominio de inteligencia

Una herramienta de análisis on-chain puede causar daño de formas que una
herramienta de inventario no puede. Éstas se consideran amenazas del producto,
no efectos secundarios:

| Amenaza | Mitigación implementada |
|---|---|
| Señalar injustamente a una persona a partir de un puntaje | El puntaje declara siempre que mide exposición, no culpabilidad, y exige revisión humana |
| Confundir una hipótesis con un hecho | Cada dato lleva su nivel epistémico; «identidad verificada» no la produce el sistema |
| Filtrar qué se está investigando | Sin listas remotas de reputación ni telemetría; advertencia explícita sobre RPC remotos |
| Envenenar el análisis con datos falsos | Procedencia obligatoria, fiabilidad por tipo de fuente y penalización del puntaje si es baja |
| Agotar el proceso con una consulta de grafo | Cotas duras verificadas por un gate contra la aplicación real |
| Leer archivos arbitrarios mediante el cargador de datasets | Identificador restringido y comprobación de ruta resuelta |
| Alterar evidencia de una investigación | Hash SHA-256 al crear, sin operación de edición, sobre auditoría encadenada |
| Convertirse en custodio por accidente vía la API de wallets | La API rechaza material privado y su análisis es consultivo por contrato |

## Controles estructurales

La aplicación solo conserva datos públicos y metadatos de control, rechaza
secretos en cualquier profundidad, limita RPC a métodos de lectura, cifra el
estado persistente y encadena la auditoría con SHA-256.
