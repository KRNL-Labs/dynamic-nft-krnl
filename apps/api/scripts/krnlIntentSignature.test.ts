import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { privateKeyToAccount } from "viem/accounts";
import { signKrnlIntent } from "../src/services/krnlIntentSigner";

const template = JSON.stringify(
  {
    sender: "{{ENV.SENDER_ADDRESS}}",
    delegate: "{{TRANSACTION_INTENT_DELEGATE}}",
    attestor: "{{ENV.ATTESTOR_IMAGE}}",
    target: {
      contract: "{{ENV.TARGET_CONTRACT}}",
      function: "setMetadataBaseURI(string)",
      parameters: ["{{METADATA_BASE_URI}}"]
    },
    intent: {
      id: "{{TRANSACTION_INTENT_ID}}",
      signature: "{{USER_SIGNATURE}}",
      deadline: "{{TRANSACTION_INTENT_DEADLINE}}"
    },
    workflow: {
      name: "set-metadata-base-uri",
      version: "v1.0.0",
      steps: [
        {
          name: "construct-evm",
          image:
            "ghcr.io/krnl-labs/executor-encoder-evm@sha256:b28823d12eb1b16cbcc34c751302cd2dbe7e35480a5bc20e4e7ad50a059b6611",
          next: "prepare-authdata",
          config: {
            parameters: [{ name: "baseUri", type: "string" }]
          },
          inputs: {
            value: {
              baseUri: "{{METADATA_BASE_URI}}"
            }
          }
        }
      ]
    }
  },
  null,
  2
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "krnl-intent-"));
fs.writeFileSync(path.join(tmpDir, "set_metadata_base_uri.workflow.json"), template, "utf8");
process.env.WORKFLOW_TEMPLATES_DIR = tmpDir;

async function main() {
  const testPk =
    "0x59c6995e998f97a5a0044976f8d02b1d94c5c040a5a9d5e8a20e5b7d8f8b6b5d";
  process.env.KRNL_SENDER_PRIVATE_KEY = testPk;
  const account = privateKeyToAccount(testPk);

  const signed = await signKrnlIntent({
    sender: account.address,
    delegate: account.address,
    chainId: 11155111,
    verifyingContract: account.address,
    intentId: "0x" + "11".repeat(32),
    deadline: Math.floor(Date.now() / 1000) + 600
  });

  assert.strictEqual(signed.intentId.length, 66);
  assert.ok(signed.signature.startsWith("0x"));
  assert.ok(signed.signature.length > 10);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { renderWorkflowTemplate } = require("../src/services/workflowTemplateService");
  const { renderedJson } = await renderWorkflowTemplate({
    type: "set_base_uri",
    variables: {
      "ENV.SENDER_ADDRESS": account.address,
      TRANSACTION_INTENT_DELEGATE: account.address,
      "ENV.ATTESTOR_IMAGE": "image://docker.io/test/attestor:latest",
      "ENV.TARGET_CONTRACT": "0x1111111111111111111111111111111111111111",
      METADATA_BASE_URI: "http://localhost:8000/metadata/brand_123/",
      TRANSACTION_INTENT_ID: signed.intentId,
      USER_SIGNATURE: signed.signature,
      TRANSACTION_INTENT_DEADLINE: signed.deadline
    }
  });

  const intent = (renderedJson as any).intent;
  assert.ok(intent);
  assert.strictEqual(intent.id.length, 66);
  assert.ok(intent.signature && intent.signature !== "0x");

  console.log("PASS: KRNL intent signature generated and injected");
}

main().catch((error) => {
  console.error("FAIL: KRNL intent signature test failed");
  console.error(error);
  process.exit(1);
});
