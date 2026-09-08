# Lab 6 — Timeline forense

```bash
node src/cli.js report examples/forensics/investigation.json --format json
```

Inspecciona `timeline.events`: combina timestamps de ledger, aplicación,
exchange y blockchain, preservando su fuente. Sólo el reloj blockchain forma
parte de la evidencia on-chain; los demás son registros aportados.
