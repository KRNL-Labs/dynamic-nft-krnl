const path = require("path");

const ACTIVE_WORKFLOWS = {
  "mint-base-nft": "workflows/mint-base-nft.json",
  mintBaseNFT: "workflows/mint-base-nft.json",
  "open-lootbox": "workflows/open-lootbox.json",
  openLootbox: "workflows/open-lootbox.json",
  "activate-traits": "workflows/activate-traits.json",
  "set-active-traits": "workflows/activate-traits.json",
  activateTraits: "workflows/activate-traits.json",
  setActiveTraitsAuth: "workflows/activate-traits.json",
  "set-trait-metadata-uri": "workflows/set-trait-metadata-uri.json",
  setTraitMetadataURIAuth: "workflows/set-trait-metadata-uri.json",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith("--")) continue;
    const key = flag.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for flag ${flag}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args.action;

  if (!action) {
    throw new Error(
      "Missing required argument: --action <mint-base-nft|open-lootbox|activate-traits|set-trait-metadata-uri>"
    );
  }

  const template = ACTIVE_WORKFLOWS[action];
  if (!template) {
    throw new Error(`Unsupported action: ${action}`);
  }

  const absoluteTemplatePath = path.resolve(template);
  const payload = {
    action,
    template,
    absoluteTemplatePath,
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
