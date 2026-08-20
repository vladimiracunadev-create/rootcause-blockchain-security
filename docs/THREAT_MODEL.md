# Modelo de amenazas

## Activos protegidos

- control administrativo y gobernanza;
- contratos y bytecode desplegado;
- fondos bloqueados o administrados por la aplicación;
- feeds de oráculos y rutas de puente;
- artefactos de compilación, dependencias y registros de despliegue;
- integridad de incidentes y auditoría.

## Adversarios y fallas

- robo o abuso de una clave administrativa;
- actualización maliciosa de un proxy;
- manipulación o vencimiento de oráculos;
- compromiso de un quorum de puente;
- dependencia alterada o compilación no reproducible;
- evento on-chain válido pero fuera de política;
- RPC falso, atrasado o conectado a la red equivocada;
- operador interno con privilegios excesivos.

## Fuera de alcance

- custodia, firma o recuperación de claves;
- bloqueo o reversión de bloques;
- prueba formal automática de contratos;
- garantía de ausencia de vulnerabilidades;
- ejecución autónoma de pausas, upgrades o retiros.

## Controles estructurales

La aplicación solo conserva datos públicos y metadatos de control, rechaza
secretos en cualquier profundidad, limita RPC a métodos de lectura, cifra el
estado persistente y encadena la auditoría con SHA-256.
