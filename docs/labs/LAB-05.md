# Lab 5 — Investigación multiwallet

```bash
node src/cli.js graph 0x1111111111111111111111111111111111111111 --chain ethereum --depth 2 --format graphml --output investigation.graphml
```

El grafo es bipartito `Address -> Transaction -> Address`. Cambia profundidad y
límites; la respuesta siempre muestra valores solicitados, aplicados, límites
duros y si hubo truncamiento.
