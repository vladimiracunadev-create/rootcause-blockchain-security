import { normalizeAddress } from "../domain/intelligence/model.js";

export function analyzeAddress(chain, address, transactions, balances = {}) {
  const normalized = normalizeAddress(chain, address).address;
  const related = transactions
    .filter((tx) => tx.chain === chain && (tx.from === normalized || tx.to === normalized))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const inflows = new Map(), outflows = new Map(), fees = new Map();
  const counterparties = new Map();
  for (const tx of related) {
    if (tx.to === normalized) inflows.set(tx.asset, (inflows.get(tx.asset) || 0n) + BigInt(tx.amount));
    if (tx.from === normalized) {
      outflows.set(tx.asset, (outflows.get(tx.asset) || 0n) + BigInt(tx.amount));
      fees.set(tx.chain === "bitcoin" ? "BTC" : tx.chain === "polygon" ? "POL" : "ETH", (fees.get(tx.chain === "bitcoin" ? "BTC" : tx.chain === "polygon" ? "POL" : "ETH") || 0n) + BigInt(tx.fee));
    }
    const counterparty = tx.from === normalized ? tx.to : tx.from;
    if (counterparty) counterparties.set(counterparty, (counterparties.get(counterparty) || 0) + 1);
  }
  return {
    chain,
    address: normalized,
    balance: balances,
    balance_scope: "Depende del provider: un nodo puede aportar estado actual; un fixture sólo deriva el saldo del conjunto observado.",
    transactions: related,
    transaction_count: related.length,
    inflows: Object.fromEntries([...inflows].map(([asset, amount]) => [asset, amount.toString()])),
    outflows: Object.fromEntries([...outflows].map(([asset, amount]) => [asset, amount.toString()])),
    fees: Object.fromEntries([...fees].map(([asset, amount]) => [asset, amount.toString()])),
    counterparties: [...counterparties]
      .map(([counterparty, count]) => ({ address: counterparty, transactions: count }))
      .sort((a, b) => b.transactions - a.transactions || a.address.localeCompare(b.address)),
    first_seen: related[0]?.timestamp || null,
    last_seen: related.at(-1)?.timestamp || null,
    epistemic_level: "inference",
    caveat: "Una dirección blockchain no identifica automáticamente a una persona o entidad."
  };
}

export const FORENSIC_GRAPH_LIMITS = Object.freeze({ maxDepth: 6, maxNodes: 500, maxEdges: 1000 });

export function buildTransactionGraph(transactions, { address = null, chain = null, depth = 2, maxNodes = 100, maxEdges = 200 } = {}) {
  const boundedDepth = Math.min(Math.max(Number(depth) || 1, 1), FORENSIC_GRAPH_LIMITS.maxDepth);
  const nodeCap = Math.min(Math.max(Number(maxNodes) || 100, 2), FORENSIC_GRAPH_LIMITS.maxNodes);
  const edgeCap = Math.min(Math.max(Number(maxEdges) || 200, 2), FORENSIC_GRAPH_LIMITS.maxEdges);
  const candidates = transactions.filter((tx) => !chain || tx.chain === chain);
  const byAddress = new Map();
  for (const tx of candidates) {
    for (const value of [tx.from, tx.to].filter(Boolean)) {
      if (!byAddress.has(value)) byAddress.set(value, []);
      byAddress.get(value).push(tx);
    }
  }
  const selected = [];
  const seenTx = new Set();
  const seenAddresses = new Set();
  let frontier = address ? [normalizeAddress(chain, address).address] : [...byAddress.keys()];
  for (let level = 0; level < boundedDepth && frontier.length; level += 1) {
    const next = [];
    for (const current of frontier) {
      if (seenAddresses.size >= nodeCap) break;
      seenAddresses.add(current);
      for (const tx of byAddress.get(current) || []) {
        if (seenTx.has(tx.evidence_hash) || selected.length * 2 >= edgeCap) continue;
        seenTx.add(tx.evidence_hash);
        selected.push(tx);
        for (const neighbour of [tx.from, tx.to].filter(Boolean)) {
          if (!seenAddresses.has(neighbour)) next.push(neighbour);
        }
      }
    }
    frontier = [...new Set(next)].sort();
  }
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const addNode = (node) => { if (!nodeIds.has(node.id) && nodes.length < nodeCap) { nodeIds.add(node.id); nodes.push(node); } };
  for (const tx of selected) {
    const transactionId = tx.chain + ":tx:" + tx.tx_hash;
    addNode({ id: transactionId, type: "Transaction", label: tx.tx_hash, chain: tx.chain, timestamp: tx.timestamp });
    if (tx.from) {
      const fromId = tx.chain + ":address:" + tx.from;
      addNode({ id: fromId, type: "Address", label: tx.from, chain: tx.chain });
      if (nodeIds.has(fromId) && nodeIds.has(transactionId) && edges.length < edgeCap) edges.push({ source: fromId, target: transactionId, relation: "sent", amount: tx.amount, asset: tx.asset });
    }
    if (tx.to) {
      const toId = tx.chain + ":address:" + tx.to;
      addNode({ id: toId, type: "Address", label: tx.to, chain: tx.chain });
      if (nodeIds.has(transactionId) && nodeIds.has(toId) && edges.length < edgeCap) edges.push({ source: transactionId, target: toId, relation: "received", amount: tx.amount, asset: tx.asset });
    }
  }
  return {
    nodes, edges,
    limits: { requestedDepth: depth, appliedDepth: boundedDepth, maxNodes: nodeCap, maxEdges: edgeCap, hardLimits: FORENSIC_GRAPH_LIMITS },
    truncated: selected.length < candidates.length || nodes.length >= nodeCap || edges.length >= edgeCap,
    epistemic_level: "observed-fact",
    caveat: "El grafo representa transferencias observadas; conectividad no implica identidad ni control común."
  };
}
