# Integración con RootCause

## Producto

~~~text
RootCause Digital Assets
├── RootCause Bitcoin Defense
└── RootCause Blockchain Security
~~~

Ambos productos comparten el motor de incidentes, el esquema de evidencia, la
auditoría, RBAC, notificaciones y la interfaz de collectors. No deben compartir
reglas de dominio ni funciones de custodia.

## Contrato recomendado de hecho

~~~json
{
  "schemaVersion": "1",
  "domain": "blockchain-security",
  "source": "evm-log",
  "observedAt": "2026-08-20T12:00:00.000Z",
  "chain": { "family": "evm", "chainId": "1" },
  "entity": { "type": "contract", "id": "eip155:1:0x..." },
  "event": { "type": "privileged_role_change", "blockNumber": 21000000 },
  "evidence": { "transactionHash": "0x...", "logIndex": 3 }
}
~~~

## Mapeo

- `projectId` → asset de RootCause;
- regla `BLK-*` → detector versionado;
- finding → observación correlacionable;
- incident → incidente principal de RootCause;
- evidence → objeto inmutable con procedencia;
- remediation → enlace a runbook, nunca ejecución automática.

La integración productiva debe agregar autenticación mutua, RBAC, colas con
idempotencia y un almacén de evidencia inmutable.
