import test from "node:test";
import assert from "node:assert/strict";
import { EvmRpcClient } from "../src/infrastructure/evm-rpc.js";

const config = {
  url: "http://127.0.0.1:8545",
  expectedChainId: "1",
  allowRemote: false,
  timeoutMs: 1000,
  responseLimitBytes: 65536
};

test("rejects remote or credential-bearing RPC endpoints by default", () => {
  assert.throws(() => new EvmRpcClient({ ...config, url: "https://rpc.example.com" }), /Remote EVM RPC/);
  assert.throws(() => new EvmRpcClient({ ...config, url: "http://user:pass@127.0.0.1:8545" }), /Credentials embedded/);
  assert.doesNotThrow(() => new EvmRpcClient(config));
});

test("rejects methods outside the read-only allowlist", async () => {
  const client = new EvmRpcClient(config, async () => {
    throw new Error("fetch should not run");
  });
  await assert.rejects(() => client.call("eth_sendRawTransaction", []), /read-only allowlist/);
});

test("creates a normalized EVM node snapshot", async () => {
  const results = {
    eth_chainId: "0x1",
    eth_blockNumber: "0x64",
    web3_clientVersion: "ExecutionClient/v1",
    eth_getBlockByNumber: { number: "0x64", timestamp: "0x65" }
  };
  const fakeFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: results[body.method] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const snapshot = await new EvmRpcClient(config, fakeFetch).snapshot();
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.chainId, "1");
  assert.equal(snapshot.blockNumber, 100);
  assert.equal(snapshot.clientVersion, "ExecutionClient/v1");
});

test("enforces the RPC response-size limit", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "x".repeat(500) }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  const client = new EvmRpcClient({ ...config, responseLimitBytes: 64 }, fakeFetch);
  await assert.rejects(() => client.call("eth_chainId"), /too large/);
});
