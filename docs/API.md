# API

Base local: `http://127.0.0.1:8790`.

Las mutaciones requieren `x-rootcause-request: 1`. El actor opcional se indica
con `x-rootcause-actor`.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/health` | Estado del servicio |
| GET | `/api/summary` | Riesgo, proyectos, wallet posture, incidentes y nodo |
| GET | `/api/projects` | Inventario público |
| POST | `/api/projects` | Registrar un proyecto sin secretos |
| GET | `/api/accounts` | Cuentas públicas vigiladas |
| POST | `/api/accounts` | Registrar una cuenta vigilada (solo dirección pública y política) |
| POST | `/api/scan` | Ejecutar reglas deterministas |
| GET | `/api/incidents` | Listar incidentes |
| PATCH | `/api/incidents/:id` | Reconocer o resolver |
| GET | `/api/policies` | Política activa |
| GET | `/api/controls` | Catálogo de controles |
| GET | `/api/audit` | Integridad de auditoría |
| POST | `/api/approvals` | Registrar hash de aprobación |
| POST | `/api/observe/event` | Ingerir hecho normalizado |
| POST | `/api/node/refresh` | Consultar RPC EVM read-only |

La API rechaza contenido distinto de JSON, cuerpos excesivos, mutaciones
cross-site y campos de secreto en cualquier profundidad.

## Eventos wallet normalizados

`POST /api/observe/event` acepta, además de `privileged_role_change` y
`value_outflow`, estos siete tipos:

~~~text
wallet.allowance.changed
wallet.operator.changed
wallet.permit.used
wallet.transfer.observed
wallet.smart-account.changed
wallet.delegation.changed
wallet.activity.observed
~~~

Evidencia mínima: `chainId`, `blockNumber`, `transactionHash`, `logIndex`,
`walletAddress` y `source`; según el tipo se suman `blockHash`,
`contractAddress`, `spender`, `operator`, `amountRaw` (entero en base 10, en
unidades del token), `decimals`, `destination`/`sourceAddress`, `delegate`,
`changeKind`, `subject` y `observedAt`. Cada evento:

- pasa validación estricta de formato y tamaño;
- rechaza secretos y transacciones firmadas en cualquier profundidad (422);
- es **idempotente** por `chainId` + `transactionHash` + `logIndex`: el mismo
  log devuelve el evento original, nunca un duplicado;
- conserva procedencia (`source`) y nivel de confianza (`confidence`:
  `observed`, `declared` o `heuristic`), separando el dato observado del
  declarado;
- exige que `walletAddress` sea una cuenta vigilada registrada (400 si no).

Ejemplos en [`../examples/`](../examples/):
[`event.wallet-allowance.json`](../examples/event.wallet-allowance.json) y
[`account.watched.sample.json`](../examples/account.watched.sample.json).
