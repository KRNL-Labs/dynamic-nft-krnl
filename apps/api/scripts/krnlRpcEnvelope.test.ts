import assert from "assert";
import nock from "nock";

// Force fetch to use node-fetch so nock can intercept HTTP
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeFetch = require("node-fetch");
// @ts-ignore
global.fetch = nodeFetch;

const KRNL_NODE_URL = "http://localhost:4545";
process.env.KRNL_NODE_URL = KRNL_NODE_URL;
process.env.KRNL_RPC_STATUS_METHOD = "krnl_workflowStatus";
process.env.RPC_SEPOLIA_URL = "https://rpc.example";
process.env.PIMLICO_API_KEY = "pimlico-key";

const workflow = { foo: "bar" };

let capturedBody: any;
nock(KRNL_NODE_URL)
  .post("/", (body) => {
    capturedBody = body;
    return true;
  })
  .reply(200, {
    jsonrpc: "2.0",
    id: 1,
    result: { requestId: "req_123", intentId: "0xintent" }
  });

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { submitWorkflow } = require("../src/services/krnlNodeClient");
  const result = await submitWorkflow({ workflowJson: workflow });

  assert.strictEqual(result.requestId, "req_123");
  assert.strictEqual(result.intentId, "0xintent");
  assert.ok(typeof capturedBody?.id === "number");
  assert.strictEqual(capturedBody.jsonrpc, "2.0");
  assert.strictEqual(capturedBody.method, "krnl_executeWorkflow");
  assert.ok(Array.isArray(capturedBody.params));
  assert.deepStrictEqual(capturedBody.params[0].foo, "bar");
  assert.strictEqual(capturedBody.params[0]._SECRETS.rpcSepoliaURL, "https://rpc.example");
  assert.strictEqual(capturedBody.params[0]._SECRETS["pimlico-apikey"], "pimlico-key");

  console.log("PASS: KRNL JSON-RPC envelope is correct");
}

main().catch((error) => {
  console.error("FAIL: KRNL JSON-RPC envelope test failed");
  console.error(error);
  process.exit(1);
});
