# Lab 8 — Integración con RootCause Server

Arranca `node src/server.js` y consulta:

```text
GET  /api/v1/forensics/transactions/:chain/:hash
GET  /api/v1/forensics/addresses/:chain/:address
GET  /api/v1/forensics/graph/:chain/:address?depth=2
POST /api/v1/forensics/reconcile
POST /api/v1/forensics/timeline
POST /api/v1/forensics/report
```

Los `POST` exigen `Content-Type: application/json` y
`x-rootcause-request: 1`. No existe endpoint para claves, firmas, construcción
o transmisión de transacciones.
