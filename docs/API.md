# API

Base local: `http://127.0.0.1:8790`.

Las mutaciones requieren `x-rootcause-request: 1`. El actor opcional se indica
con `x-rootcause-actor`.

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/health` | Estado del servicio |
| GET | `/api/summary` | Riesgo, proyectos, incidentes y nodo |
| GET | `/api/projects` | Inventario público |
| POST | `/api/projects` | Registrar un proyecto sin secretos |
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
