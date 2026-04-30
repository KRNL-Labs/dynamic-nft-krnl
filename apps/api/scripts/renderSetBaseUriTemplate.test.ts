import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";

const template = JSON.stringify(
  {
    sender: "{{ENV.SENDER_ADDRESS}}",
    delegate: "{{TRANSACTION_INTENT_DELEGATE}}",
    attestor: "{{ENV.ATTESTOR_IMAGE}}",
    target: {
      contract: "{{ENV.TARGET_CONTRACT}}",
      function:
        "setMetadataBaseURI((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes))",
      authData_result: "${construct-evm.result}",
      parameters: []
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
          attestor: "{{ENV.ATTESTOR_IMAGE}}",
          next: "prepare-authdata",
          config: {
            parameters: [{ name: "baseUri", type: "string" }]
          },
          inputs: {
            value: {
              baseUri: "{{METADATA_BASE_URI}}"
            }
          },
          outputs: [
            {
              name: "result",
              value: "result",
              required: true,
              export: true
            }
          ]
        }
      ]
    }
  },
  null,
  2
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "krnl-templates-"));
fs.writeFileSync(path.join(tmpDir, "set_metadata_base_uri.workflow.json"), template, "utf8");
process.env.WORKFLOW_TEMPLATES_DIR = tmpDir;

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { renderWorkflowTemplate } = require("../src/services/workflowTemplateService");

  const variables = {
    "ENV.SENDER_ADDRESS": "0x1111111111111111111111111111111111111111",
    TRANSACTION_INTENT_DELEGATE: "0x2222222222222222222222222222222222222222",
    "ENV.ATTESTOR_IMAGE": "image://docker.io/test/attestor:latest",
    "ENV.TARGET_CONTRACT": "0x3333333333333333333333333333333333333333",
    METADATA_BASE_URI: "https://example.com/metadata/brand_123",
    TRANSACTION_INTENT_ID: "0xabc",
    USER_SIGNATURE: "0x",
    TRANSACTION_INTENT_DEADLINE: 123456
  };

  const { renderedJson } = await renderWorkflowTemplate({
    type: "set_base_uri",
    variables
  });

  assert.ok(renderedJson && typeof renderedJson === "object");
  const target = (renderedJson as any).target;
  assert.ok(target, "target is missing");
  assert.strictEqual(
    target.function,
    "setMetadataBaseURI((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes))"
  );
  assert.ok(Array.isArray(target.parameters));
  assert.strictEqual(target.parameters.length, 0);
  assert.strictEqual(target.authData_result, "${construct-evm.result}");

  const steps = (renderedJson as any).workflow?.steps;
  assert.ok(Array.isArray(steps));
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].name, "construct-evm");
  assert.strictEqual(
    steps[0].image,
    "ghcr.io/krnl-labs/executor-encoder-evm@sha256:b28823d12eb1b16cbcc34c751302cd2dbe7e35480a5bc20e4e7ad50a059b6611"
  );
  assert.strictEqual(steps[0].next, "prepare-authdata");
  assert.ok(!("type" in steps[0]));

  console.log("PASS: set-metadata-base-uri template renders with construct-evm step");
}

main().catch((error) => {
  console.error("FAIL: render set-metadata-base-uri template test failed");
  console.error(error);
  process.exit(1);
});
