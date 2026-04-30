import assert from "assert";
import nock from "nock";

// Force fetch to use node-fetch so nock can intercept HTTP requests.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeFetch = require("node-fetch");
// @ts-ignore
global.fetch = nodeFetch;

const KRNL_NODE_URL = "http://localhost:4547";
const requestId = "713e0fb9-58e4-4ad3-84af-c5a1329ec2e7";
const txHash = "0x1111111111111111111111111111111111111111111111111111111111111111";

process.env.KRNL_NODE_URL = KRNL_NODE_URL;
process.env.RPC_SEPOLIA_URL = "https://rpc.example";
process.env.PIMLICO_API_KEY = "pimlico-key";

nock(KRNL_NODE_URL)
  .get(`/workflow/${requestId}`)
  .reply(200, {
    status: "queued"
  })
  .get(`/workflow/${requestId}`)
  .reply(200, {
    status: "completed",
    txHash
  });

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getKrnlRunStatusHttp } = require("../src/services/krnlService");

  const first = await getKrnlRunStatusHttp(requestId);
  assert.strictEqual(first.status, "queued");
  assert.strictEqual(first.txHash, undefined);

  const second = await getKrnlRunStatusHttp(requestId);
  assert.strictEqual(second.status, "succeeded");
  assert.strictEqual(second.txHash, txHash);

  console.log("PASS: KRNL requestId HTTP polling maps queued -> succeeded with txHash");
}

main().catch((error) => {
  console.error("FAIL: KRNL requestId HTTP polling test failed");
  console.error(error);
  process.exit(1);
});

