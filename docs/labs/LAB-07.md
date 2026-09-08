# Lab 7 — Evidence report

```bash
node src/cli.js report examples/forensics/investigation.json --output evidence-report.md
```

Verifica que cada hecho enlace fuente y hash, que las hipótesis lleven la marca
`HIPÓTESIS, NO EVIDENCIA`, y que el informe tenga `report_hash` en su salida
JSON. Un texto generado por IA nunca puede ocupar la sección de evidencia.
