import assert from "assert";

const { parseSubmitWorkflowResult } = require("../src/services/krnlNodeClient");

const caseA = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    intentId: "",
    requestId: "afb0a815-73d6-45cc-bd9f-ee21bd828465",
    admissionResult: { accepted: true, queue_position: 1 },
    workflowName: "mint-base-nft"
  }
};

const parsedA = parseSubmitWorkflowResult(caseA);
assert.strictEqual(parsedA.requestId, "afb0a815-73d6-45cc-bd9f-ee21bd828465");
assert.strictEqual(parsedA.intentId, null);

const caseB = {
  jsonrpc: "2.0",
  id: 2,
  result: {
    intentId: "0x1234"
  }
};

assert.throws(
  () => parseSubmitWorkflowResult(caseB),
  /missing requestId/i
);

console.log("PASS: KRNL submit response parsing handles empty intentId and missing requestId");
