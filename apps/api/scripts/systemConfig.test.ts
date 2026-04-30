import assert from "assert";

process.env.GLOBAL_METADATA_BASE_URI = "http://localhost:8000/metadata/";
process.env.METADATA_BASE_URL = "";
process.env.TRAIT_METADATA_URI = "";
process.env.KRNL_DEFAULT_CHAIN_ID = "11155111";
process.env.DEFAULT_NFT_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001";

const { buildSystemConfigResponse } = require("../src/services/systemConfig");

try {
  const config = buildSystemConfigResponse();
  assert.strictEqual(config.globalMetadataBaseUri, "http://localhost:8000/metadata/");
  assert.strictEqual(config.traitMetadataUri, "http://localhost:8000/metadata/traits/schema");
  assert.strictEqual(config.erc7496Supported, true);
  console.log("PASS: /api/system/config includes traitMetadataUri and erc7496Supported");
} catch (error) {
  console.error("FAIL: /api/system/config fields missing");
  console.error(error);
  process.exit(1);
}
