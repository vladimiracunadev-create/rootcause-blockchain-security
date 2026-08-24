import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTransaction } from "../src/domain/intelligence/model.js";
import {
  GRAPH_LIMITS,
  buildFundsGraph,
  detectCycles,
  distanceToFlagged,
  fanSummary,
  findCommunities,
  findPaths,
  traverse
} from "../src/domain/intelligence/graph.js";

const SOURCE = { kind: "local-dataset", id: "graph-test" };
const address = (seed) => ("0x" + String(seed).repeat(40)).slice(0, 42);

function chain(length) {
  return Array.from({ length }, (_, index) =>
    normalizeTransaction(
      {
        network: "ethereum",
        txid: "0x" + (index + 1).toString(16).padStart(64, "0"),
        timestamp: new Date(Date.UTC(2026, 7, 1, index)).toISOString(),
        transfers: [{ from: address(index + 1), to: address(index + 2), amountRaw: "1000", asset: "ETH" }]
      },
      SOURCE
    )
  );
}

test("builds a directed value graph with aggregated node counters", () => {
  const graph = buildFundsGraph(chain(3));
  assert.equal(graph.stats.nodeCount, 4);
  assert.equal(graph.stats.edgeCount, 3);
  const middle = graph.nodes.get("ethereum:" + address(2));
  assert.equal(middle.inDegree, 1);
  assert.equal(middle.outDegree, 1);
  // El nodo interno acumula en BigInt; la proyección pública lo pasa a texto.
  assert.equal(middle.receivedRaw, 1000n);
  assert.equal(middle.sentRaw, 1000n);
  const projected = traverse(buildFundsGraph(chain(3)), "ethereum:" + address(2), { maxDepth: 1 });
  assert.equal(projected.nodes[0].receivedRaw, "1000");
});

test("traversal respects the depth limit and says it truncated", () => {
  const graph = buildFundsGraph(chain(6));
  const result = traverse(graph, "ethereum:" + address(1), { direction: "forward", maxDepth: 2 });
  assert.equal(result.nodes.length, 3); // origen + dos saltos
  assert.equal(result.truncated, true);
  assert.ok(result.truncationReasons.includes("max-depth"));
});

test("traversal respects the node cap without throwing", () => {
  const transactions = Array.from({ length: 30 }, (_, index) =>
    normalizeTransaction(
      {
        network: "ethereum",
        txid: "0x" + (index + 100).toString(16).padStart(64, "0"),
        timestamp: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
        transfers: [{ from: address(1), to: address(index + 2), amountRaw: "10", asset: "ETH" }]
      },
      SOURCE
    )
  );
  const graph = buildFundsGraph(transactions);
  const result = traverse(graph, "ethereum:" + address(1), { maxNodes: 5 });
  assert.ok(result.nodes.length <= 5);
  assert.equal(result.truncated, true);
  assert.ok(result.truncationReasons.includes("max-nodes"));
});

test("traversal never exceeds the hard ceilings even if asked to", () => {
  const graph = buildFundsGraph(chain(3));
  const result = traverse(graph, "ethereum:" + address(1), { maxDepth: 9999, maxNodes: 999999 });
  assert.ok(result.limits.maxDepth <= GRAPH_LIMITS.maxDepth);
  assert.ok(result.limits.maxNodes <= GRAPH_LIMITS.maxNodes);
});

test("backward traversal reaches the origin of the funds", () => {
  const graph = buildFundsGraph(chain(3));
  const result = traverse(graph, "ethereum:" + address(4), { direction: "backward", maxDepth: 3 });
  assert.ok(result.nodes.some((node) => node.key === "ethereum:" + address(1)));
});

test("traversal of an unknown address reports not found instead of failing", () => {
  const graph = buildFundsGraph(chain(2));
  const result = traverse(graph, "ethereum:" + address(9));
  assert.equal(result.found, false);
  assert.deepEqual(result.nodes, []);
});

test("finds simple paths between two addresses", () => {
  const graph = buildFundsGraph(chain(4));
  const result = findPaths(graph, "ethereum:" + address(1), "ethereum:" + address(4), { maxDepth: 5 });
  assert.equal(result.paths.length, 1);
  assert.equal(result.paths[0].hops, 3);
});

test("detects a cycle where funds return to their origin", () => {
  const transactions = [
    ...chain(2),
    normalizeTransaction(
      {
        network: "ethereum",
        txid: "0x" + "f".repeat(64),
        timestamp: "2026-08-01T05:00:00.000Z",
        transfers: [{ from: address(3), to: address(1), amountRaw: "900", asset: "ETH" }]
      },
      SOURCE
    )
  ];
  const result = detectCycles(buildFundsGraph(transactions), { maxDepth: 5 });
  assert.ok(result.cycles.length >= 1);
});

test("measures distance to the nearest locally flagged address", () => {
  const graph = buildFundsGraph(chain(4));
  const flagged = new Set(["ethereum:" + address(4)]);
  const result = distanceToFlagged(graph, "ethereum:" + address(1), flagged, { maxDepth: 4 });
  assert.equal(result.distance, 3);
  assert.equal(result.via, "ethereum:" + address(4));
});

test("distance is null when no flagged address is within reach", () => {
  const graph = buildFundsGraph(chain(2));
  const result = distanceToFlagged(graph, "ethereum:" + address(1), new Set(["ethereum:" + address(9)]), {
    maxDepth: 3
  });
  assert.equal(result.distance, null);
});

test("communities are connected components labelled as inference, not ownership", () => {
  const transactions = [
    ...chain(2),
    normalizeTransaction(
      {
        network: "ethereum",
        txid: "0x" + "e".repeat(64),
        timestamp: "2026-08-02T00:00:00.000Z",
        transfers: [{ from: address(7), to: address(8), amountRaw: "5", asset: "ETH" }]
      },
      SOURCE
    )
  ];
  const communities = findCommunities(buildFundsGraph(transactions));
  assert.equal(communities.length, 2);
  assert.equal(communities[0].epistemicLevel, "inference");
  assert.match(communities[0].caveat, /no implica titularidad/i);
});

test("fan summary counts unique sources and destinations", () => {
  const transactions = [
    normalizeTransaction(
      {
        network: "ethereum",
        txid: "0x" + "1".repeat(64),
        timestamp: "2026-08-01T00:00:00.000Z",
        transfers: [
          { from: address(2), to: address(1), amountRaw: "10", asset: "ETH" },
          { from: address(3), to: address(1), amountRaw: "10", asset: "ETH" }
        ]
      },
      SOURCE
    )
  ];
  const summary = fanSummary(buildFundsGraph(transactions), "ethereum:" + address(1));
  assert.equal(summary.fanIn.uniqueSources, 2);
  assert.equal(summary.fanOut.uniqueDestinations, 0);
});

test("filters restrict traversal by asset and minimum amount", () => {
  const transactions = [
    normalizeTransaction(
      {
        network: "ethereum",
        txid: "0x" + "2".repeat(64),
        timestamp: "2026-08-01T00:00:00.000Z",
        transfers: [
          { from: address(1), to: address(2), amountRaw: "10", asset: "ETH" },
          { from: address(1), to: address(3), amountRaw: "5000", asset: "USDC" }
        ]
      },
      SOURCE
    )
  ];
  const graph = buildFundsGraph(transactions);
  const filtered = traverse(graph, "ethereum:" + address(1), { filter: { asset: "USDC" } });
  assert.equal(filtered.edges.length, 1);
  assert.equal(filtered.edges[0].asset, "USDC");
  const byAmount = traverse(graph, "ethereum:" + address(1), { filter: { minAmountRaw: "100" } });
  assert.equal(byAmount.edges.length, 1);
});
