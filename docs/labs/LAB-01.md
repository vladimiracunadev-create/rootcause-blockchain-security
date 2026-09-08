# Lab 1 — Validación de una TX

```bash
node src/cli.js blockchain tx aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --chain ethereum
```

Comprueba los 15 campos de `BlockchainTransaction`, `provenance.fields`,
`epistemic_level=observed-fact` y `evidence_hash`. El monto está expresado en la
unidad mínima del activo; no se usa coma flotante.
