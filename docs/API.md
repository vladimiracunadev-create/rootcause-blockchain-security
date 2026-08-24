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

## API v1 de inteligencia

Contrato versionado bajo `/api/v1/`, especificado en
[`openapi-intelligence.yaml`](openapi-intelligence.yaml). Las rutas heredadas
bajo `/api/` siguen funcionando sin cambios.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/v1/intelligence/summary` | Estado del dominio, conectores y cotas |
| GET | `/api/v1/intelligence/indicators` | Catálogo de los 15 indicadores `INT-*` |
| GET | `/api/v1/intelligence/datasets` | Datasets sintéticos y su resultado esperado |
| GET | `/api/v1/intelligence/connectors` | Conectores registrados y sus métricas |
| POST | `/api/v1/intelligence/ingest` | Ingerir bloques y transacciones normalizados |
| POST | `/api/v1/intelligence/ingest/dataset` | Ingerir un dataset por identificador |
| POST | `/api/v1/intelligence/ingest/connector` | Ingerir desde un conector registrado |
| POST | `/api/v1/intelligence/analyze` | Ejecutar el motor de indicadores |
| GET | `/api/v1/risk/addresses/{red}/{dirección}` | Riesgo explicado de una dirección |
| GET | `/api/v1/risk/contracts/{red}/{dirección}` | Riesgo explicado de un contrato |
| POST | `/api/v1/risk/transactions` | Análisis previo **consultivo** de una transacción |
| GET | `/api/v1/intelligence/graph/{red}/{dirección}` | Recorrido acotado del movimiento de fondos |
| GET | `/api/v1/intelligence/paths` | Caminos simples entre dos direcciones |
| GET | `/api/v1/intelligence/cycles` | Ciclos observados |
| GET | `/api/v1/intelligence/communities` | Componentes conexos (inferencia) |
| GET | `/api/v1/intelligence/alerts` | Listar alertas |
| PATCH | `/api/v1/intelligence/alerts/{id}` | Cambiar estado o asignar |
| GET | `/api/v1/intelligence/cases` | Listar casos |
| POST | `/api/v1/intelligence/cases` | Abrir un caso |
| PATCH | `/api/v1/intelligence/cases/{id}` | Notas, decisiones y estado |
| POST | `/api/v1/intelligence/cases/{id}/evidence` | Adjuntar evidencia inmutable |
| GET | `/api/v1/intelligence/cases/{id}/report` | Informe técnico del caso |
| GET | `/api/v1/intelligence/evidence/verify` | Verificar integridad de la evidencia |
| POST | `/api/v1/intelligence/registry/{contracts\|drainers\|bridges}` | Registro **local** del operador |
| POST | `/api/v1/intelligence/exploits` | Registrar un incidente conocido |

### Garantías de la API de riesgo

- **Nunca** solicita claves privadas, frases semilla, keystores ni autorización
  para mover fondos; el material privado se rechaza con `422` a cualquier
  profundidad del cuerpo.
- **Nunca** construye, firma ni transmite una transacción.
- El puntaje **siempre** llega con sus factores, su confianza, sus limitaciones
  y la versión del modelo. No hay ninguna ruta que devuelva un número suelto.
- `POST /api/v1/risk/transactions` devuelve `decision: "advisory-only"` de forma
  fija: advierte, no autoriza ni bloquea.
- El grafo aplica sus cotas aunque se pidan valores extremos, y declara si el
  resultado está truncado.

~~~bash
curl http://127.0.0.1:8790/api/v1/risk/addresses/ethereum/0x1111111111111111111111111111111111111111

curl -X POST http://127.0.0.1:8790/api/v1/intelligence/ingest/dataset \
  -H "content-type: application/json" \
  -H "x-rootcause-request: 1" \
  --data '{"datasetId":"08-drainer-simulado"}'
~~~

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
