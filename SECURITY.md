# Seguridad

## Reportar una vulnerabilidad

No publiques detalles explotables en un issue público. Usa el canal privado del
responsable del despliegue e incluye versión, impacto, pasos mínimos y evidencia
sanitizada.

## Frontera de confianza

La aplicación acepta únicamente identificadores públicos, hechos observados y
metadatos de control. Nunca debe recibir claves privadas, frases semilla,
keystores, firmas pendientes, transacciones firmadas sin publicar, PIN,
contraseñas, passkeys, tokens de acceso ni credenciales RPC.

La postura de wallets es watch-only en el mismo sentido estricto: no existe
conexión de wallet (`window.ethereum`, WalletConnect), no hay métodos de firma
y la interfaz no ofrece revocar, transferir ni pausar. Las capacidades vetadas
(`eth_send*`, `eth_sign*`, `personal_*`, `wallet_request*`, `wallet_add*`,
`wallet_switch*`) están vigiladas por `scripts/check-security-claims.js`, que
distingue código ejecutable de documentación explicativa y corre en CI. Las
cuentas vigiladas se registran sin información personal: ni nombre real, ni
correo, ni teléfono, ni ubicación, ni biometría, ni respaldos.

El conector EVM solo permite métodos JSON-RPC de lectura, usa localhost por
defecto, aplica timeout y limita el tamaño de respuesta. Un despliegue real debe
sumar aislamiento de red, autenticación del reverse proxy, un gestor de secretos
y respaldos cifrados.

## Respuesta

Si se sospecha exposición de una clave administrativa, RootCause ayuda a
detectar y preservar evidencia, pero no firma ni ejecuta la respuesta. Activa el
runbook aprobado, pausa mediante el proceso humano correspondiente y rota los
roles desde un entorno independiente.
