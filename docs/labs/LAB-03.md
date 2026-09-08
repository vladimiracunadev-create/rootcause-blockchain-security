# Lab 3 — Reconciliación

```bash
node src/cli.js reconcile examples/forensics/internal-ledger.csv
```

El resultado esperado contiene un `MATCH`, un `AMOUNT_MISMATCH`, un
`MISSING_ONCHAIN` y un `MISSING_INTERNAL`. Prueba luego `--format csv` para una
salida tabular auditable.
