// Grafo de movimiento de fondos, con límites de seguridad obligatorios.
//
// Un grafo de transacciones es una estructura que invita a consultas ilimitadas:
// "sígueme este dinero" puede recorrer media cadena y agotar la memoria del
// proceso. Aquí toda operación acepta cotas explícitas, y cuando una cota se
// alcanza el resultado dice que está TRUNCADO en vez de fingir ser completo.
//
// Todos los recorridos son deterministas: el orden de expansión está ordenado,
// no depende de la inserción ni de ninguna fuente de azar.
import { toBigInt } from "./model.js";

export const GRAPH_LIMITS = Object.freeze({
  maxDepth: 6,
  maxNodes: 2000,
  maxEdges: 8000,
  maxPaths: 25,
  maxCycles: 50
});

function bound(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function edgeId(edge) {
  return [edge.txid, edge.transferIndex, edge.from, edge.to].join("|");
}

/**
 * Construye el grafo dirigido de valor a partir de transacciones normalizadas.
 * Nodo = dirección; arista = una transferencia observada.
 */
export function buildFundsGraph(transactions = []) {
  const nodes = new Map();
  const edges = [];
  const outgoing = new Map();
  const incoming = new Map();

  function touch(network, address, timestamp) {
    const key = network + ":" + address;
    let node = nodes.get(key);
    if (!node) {
      node = {
        key,
        network,
        address,
        firstSeen: timestamp,
        lastSeen: timestamp,
        receivedRaw: 0n,
        sentRaw: 0n,
        inDegree: 0,
        outDegree: 0,
        transactionIds: new Set()
      };
      nodes.set(key, node);
    }
    if (timestamp < node.firstSeen) node.firstSeen = timestamp;
    if (timestamp > node.lastSeen) node.lastSeen = timestamp;
    return node;
  }

  for (const transaction of transactions) {
    for (const transfer of transaction.transfers || []) {
      const amount = toBigInt(transfer.amountRaw) ?? 0n;
      const fromNode = transfer.from ? touch(transaction.network, transfer.from, transaction.timestamp) : null;
      const toNode = transfer.to ? touch(transaction.network, transfer.to, transaction.timestamp) : null;
      if (fromNode) {
        fromNode.sentRaw += amount;
        fromNode.transactionIds.add(transaction.txid);
      }
      if (toNode) {
        toNode.receivedRaw += amount;
        toNode.transactionIds.add(transaction.txid);
      }
      if (!fromNode || !toNode) continue;
      const edge = {
        from: fromNode.key,
        to: toNode.key,
        network: transaction.network,
        amountRaw: transfer.amountRaw,
        asset: transfer.asset,
        assetContract: transfer.assetContract || null,
        decimals: transfer.decimals,
        txid: transaction.txid,
        transferIndex: transfer.index,
        blockHeight: transaction.blockHeight,
        timestamp: transaction.timestamp,
        kind: transfer.kind
      };
      edges.push(edge);
      fromNode.outDegree += 1;
      toNode.inDegree += 1;
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      outgoing.get(edge.from).push(edge);
      incoming.get(edge.to).push(edge);
    }
  }

  // Orden estable: mismo grafo, mismo recorrido, misma respuesta.
  for (const list of outgoing.values()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || edgeId(a).localeCompare(edgeId(b)));
  }
  for (const list of incoming.values()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || edgeId(a).localeCompare(edgeId(b)));
  }

  return {
    nodes,
    edges,
    outgoing,
    incoming,
    stats: { nodeCount: nodes.size, edgeCount: edges.length }
  };
}

function passesFilter(edge, filter) {
  if (!filter) return true;
  if (filter.asset && edge.asset !== filter.asset) return false;
  if (filter.network && edge.network !== filter.network) return false;
  if (filter.minAmountRaw) {
    const minimum = toBigInt(filter.minAmountRaw);
    const amount = toBigInt(edge.amountRaw);
    if (minimum !== null && amount !== null && amount < minimum) return false;
  }
  if (filter.since && edge.timestamp < filter.since) return false;
  if (filter.until && edge.timestamp > filter.until) return false;
  return true;
}

function publicNode(node) {
  return {
    key: node.key,
    network: node.network,
    address: node.address,
    firstSeen: node.firstSeen,
    lastSeen: node.lastSeen,
    receivedRaw: node.receivedRaw.toString(),
    sentRaw: node.sentRaw.toString(),
    inDegree: node.inDegree,
    outDegree: node.outDegree,
    transactionCount: node.transactionIds.size
  };
}

/**
 * Recorre el grafo desde una dirección, hacia adelante (destino de los fondos),
 * hacia atrás (origen) o en ambas direcciones. Siempre acotado.
 */
export function traverse(graph, startKey, options = {}) {
  const direction = ["forward", "backward", "both"].includes(options.direction)
    ? options.direction
    : "forward";
  const maxDepth = bound(options.maxDepth, 3, GRAPH_LIMITS.maxDepth);
  const maxNodes = bound(options.maxNodes, 250, GRAPH_LIMITS.maxNodes);
  const maxEdges = bound(options.maxEdges, 1000, GRAPH_LIMITS.maxEdges);

  const start = graph.nodes.get(startKey);
  if (!start) {
    return {
      start: startKey,
      direction,
      depth: maxDepth,
      nodes: [],
      edges: [],
      truncated: false,
      truncationReasons: [],
      found: false
    };
  }

  const visited = new Map([[startKey, 0]]);
  const collectedEdges = new Map();
  const truncationReasons = new Set();
  let frontier = [startKey];

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = [];
    for (const key of [...frontier].sort()) {
      const candidates = [];
      if (direction === "forward" || direction === "both") {
        candidates.push(...(graph.outgoing.get(key) || []).map((edge) => [edge, edge.to]));
      }
      if (direction === "backward" || direction === "both") {
        candidates.push(...(graph.incoming.get(key) || []).map((edge) => [edge, edge.from]));
      }
      for (const [edge, neighbour] of candidates) {
        if (!passesFilter(edge, options.filter)) continue;
        if (collectedEdges.size >= maxEdges) {
          truncationReasons.add("max-edges");
          break;
        }
        collectedEdges.set(edgeId(edge), edge);
        if (visited.has(neighbour)) continue;
        if (visited.size >= maxNodes) {
          truncationReasons.add("max-nodes");
          continue;
        }
        visited.set(neighbour, depth + 1);
        next.push(neighbour);
      }
    }
    if (!next.length) break;
    if (depth + 1 >= maxDepth && next.length) truncationReasons.add("max-depth");
    frontier = next;
  }

  return {
    start: startKey,
    direction,
    depth: maxDepth,
    nodes: [...visited.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([key, hops]) => ({ ...publicNode(graph.nodes.get(key)), hops })),
    edges: [...collectedEdges.values()],
    truncated: truncationReasons.size > 0,
    truncationReasons: [...truncationReasons],
    found: true,
    limits: { maxDepth, maxNodes, maxEdges }
  };
}

/** Caminos simples entre dos direcciones, acotados en profundidad y cantidad. */
export function findPaths(graph, fromKey, toKey, options = {}) {
  const maxDepth = bound(options.maxDepth, 4, GRAPH_LIMITS.maxDepth);
  const maxPaths = bound(options.maxPaths, 10, GRAPH_LIMITS.maxPaths);
  const paths = [];
  let truncated = false;

  function walk(current, target, trail, edgeTrail, depth) {
    if (paths.length >= maxPaths) {
      truncated = true;
      return;
    }
    if (current === target && trail.length > 1) {
      paths.push({ nodes: [...trail], edges: [...edgeTrail], hops: edgeTrail.length });
      return;
    }
    if (depth >= maxDepth) {
      truncated = true;
      return;
    }
    for (const edge of graph.outgoing.get(current) || []) {
      if (!passesFilter(edge, options.filter)) continue;
      if (trail.includes(edge.to)) continue; // camino simple: sin repetir nodo
      trail.push(edge.to);
      edgeTrail.push(edge);
      walk(edge.to, target, trail, edgeTrail, depth + 1);
      trail.pop();
      edgeTrail.pop();
    }
  }

  if (graph.nodes.has(fromKey) && graph.nodes.has(toKey)) {
    walk(fromKey, toKey, [fromKey], [], 0);
  }
  return { from: fromKey, to: toKey, paths, truncated, limits: { maxDepth, maxPaths } };
}

/** Ciclos dirigidos: fondos que vuelven a una dirección por la que ya pasaron. */
export function detectCycles(graph, options = {}) {
  const maxDepth = bound(options.maxDepth, 5, GRAPH_LIMITS.maxDepth);
  const maxCycles = bound(options.maxCycles, 20, GRAPH_LIMITS.maxCycles);
  const cycles = [];
  const seen = new Set();
  let truncated = false;

  for (const startKey of [...graph.nodes.keys()].sort()) {
    if (cycles.length >= maxCycles) {
      truncated = true;
      break;
    }
    const stack = [[startKey, [startKey], []]];
    while (stack.length) {
      const [current, trail, edgeTrail] = stack.pop();
      if (trail.length > maxDepth) continue;
      for (const edge of graph.outgoing.get(current) || []) {
        if (!passesFilter(edge, options.filter)) continue;
        if (edge.to === startKey && edgeTrail.length >= 1) {
          const signature = [...trail].sort().join(">");
          if (!seen.has(signature)) {
            seen.add(signature);
            cycles.push({ nodes: [...trail, startKey], edges: [...edgeTrail, edge], length: trail.length });
          }
          continue;
        }
        if (trail.includes(edge.to)) continue;
        stack.push([edge.to, [...trail, edge.to], [...edgeTrail, edge]]);
      }
    }
  }
  return { cycles: cycles.slice(0, maxCycles), truncated: truncated || cycles.length > maxCycles };
}

/**
 * Distancia en saltos a la dirección marcada más cercana. Sirve para el factor
 * de proximidad del puntaje de riesgo: estar a un salto de una dirección
 * marcada no es lo mismo que estar a cinco, y ninguna de las dos cosas es una
 * acusación.
 */
export function distanceToFlagged(graph, startKey, flaggedKeys, options = {}) {
  const maxDepth = bound(options.maxDepth, 4, GRAPH_LIMITS.maxDepth);
  const flagged = new Set(flaggedKeys);
  if (flagged.has(startKey)) {
    return { distance: 0, via: startKey, path: [startKey], searched: 1, truncated: false };
  }
  const visited = new Set([startKey]);
  let frontier = [[startKey, [startKey]]];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const next = [];
    for (const [key, trail] of frontier) {
      const neighbours = [
        ...(graph.outgoing.get(key) || []).map((edge) => edge.to),
        ...(graph.incoming.get(key) || []).map((edge) => edge.from)
      ].sort();
      for (const neighbour of neighbours) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        const nextTrail = [...trail, neighbour];
        if (flagged.has(neighbour)) {
          return { distance: depth, via: neighbour, path: nextTrail, searched: visited.size, truncated: false };
        }
        next.push([neighbour, nextTrail]);
        if (visited.size >= GRAPH_LIMITS.maxNodes) {
          return { distance: null, via: null, path: [], searched: visited.size, truncated: true };
        }
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return { distance: null, via: null, path: [], searched: visited.size, truncated: false };
}

/**
 * Comunidades por componentes conexos (ignorando la dirección). Es la
 * agrupación más conservadora posible: dice "estas direcciones están
 * conectadas por transferencias observadas", no "estas direcciones son del
 * mismo dueño". Cualquier lectura de titularidad es una HIPÓTESIS del analista.
 */
export function findCommunities(graph, options = {}) {
  const maxCommunities = bound(options.maxCommunities, 50, 500);
  const seen = new Set();
  const communities = [];
  for (const startKey of [...graph.nodes.keys()].sort()) {
    if (seen.has(startKey)) continue;
    const members = [];
    const stack = [startKey];
    seen.add(startKey);
    while (stack.length) {
      const key = stack.pop();
      members.push(key);
      const neighbours = [
        ...(graph.outgoing.get(key) || []).map((edge) => edge.to),
        ...(graph.incoming.get(key) || []).map((edge) => edge.from)
      ];
      for (const neighbour of neighbours) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        stack.push(neighbour);
      }
    }
    communities.push({
      id: "community-" + communities.length,
      members: members.sort(),
      size: members.length,
      epistemicLevel: "inference",
      caveat: "Componente conexo por transferencias observadas; no implica titularidad común."
    });
  }
  return communities
    .sort((a, b) => b.size - a.size || a.members[0].localeCompare(b.members[0]))
    .slice(0, maxCommunities);
}

/** Resumen de concentración de flujo alrededor de una dirección. */
export function fanSummary(graph, key) {
  const incoming = graph.incoming.get(key) || [];
  const outgoing = graph.outgoing.get(key) || [];
  const sources = new Set(incoming.map((edge) => edge.from));
  const destinations = new Set(outgoing.map((edge) => edge.to));
  return {
    key,
    fanIn: { uniqueSources: sources.size, transfers: incoming.length },
    fanOut: { uniqueDestinations: destinations.size, transfers: outgoing.length }
  };
}

export function graphSummary(graph) {
  return {
    nodes: graph.stats.nodeCount,
    edges: graph.stats.edgeCount,
    limits: GRAPH_LIMITS
  };
}
