import assert from "assert";

const {
  resolveCanonicalWorkflowIntentId
} = require("../src/services/krnlIntentIdResolver");

const txIntentId =
  "0x45e92ab6cf16f59d4df2f2f2c6c26f843baecdeeb84ea617ff9b234f8d2e4c11";

const renderedWorkflow = {
  intent: {
    id: txIntentId
  }
};

const canonical = resolveCanonicalWorkflowIntentId({
  workflowJson: renderedWorkflow,
  krnlIntentId: ""
});

assert.strictEqual(
  canonical,
  txIntentId,
  "Workflow intentId must stay the signed tx intent id when KRNL returns empty intentId"
);

console.log("PASS: canonical KRNL intent id prefers payload.intent.id");
