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
