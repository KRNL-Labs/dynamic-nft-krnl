const resolveGlobalMetadataBaseUriValue = () =>
  process.env.GLOBAL_METADATA_BASE_URI || process.env.METADATA_BASE_URL || "";

export const resolveGlobalMetadataBaseUri = (): string | null => {
  const value = resolveGlobalMetadataBaseUriValue().trim();
  if (!value) return null;
  try {
    new URL(value);
  } catch {
    return null;
  }
  if (!value.endsWith("/")) return null;
  return value;
};

export const requireGlobalMetadataBaseUri = (): string => {
  const value = resolveGlobalMetadataBaseUri();
  if (!value) {
    throw new Error("GLOBAL_METADATA_BASE_URI not configured");
  }
  return value;
};

// Trait metadata schema URI resolution:
// 1) Use explicit TRAIT_METADATA_URI if set and valid.
// 2) Otherwise derive from GLOBAL_METADATA_BASE_URI by appending "traits/schema".
export const resolveTraitMetadataUri = (): string | null => {
  const explicit = (process.env.TRAIT_METADATA_URI || "").trim();
  if (explicit) {
    try {
      new URL(explicit);
      return explicit;
    } catch {
      return null;
    }
  }

  const base = resolveGlobalMetadataBaseUri();
  if (!base) return null;
  return `${base}traits/schema`;
};

export const buildSystemConfigResponse = () => {
  const globalMetadataBaseUri = resolveGlobalMetadataBaseUri();
  if (!globalMetadataBaseUri) {
    throw new Error("GLOBAL_METADATA_BASE_URI not configured");
  }

  const chainIdRaw = process.env.KRNL_DEFAULT_CHAIN_ID || "11155111";
  const chainId = Number(chainIdRaw);
  const contractAddress = process.env.DEFAULT_NFT_CONTRACT_ADDRESS || "";
  const traitMetadataUri = resolveTraitMetadataUri() || `${globalMetadataBaseUri}traits/schema`;

  return {
    chainId: Number.isFinite(chainId) ? chainId : chainIdRaw,
    contractAddress,
    globalMetadataBaseUri,
    traitMetadataUri,
    erc7496Supported: true,
    // Backwards-compatible keys
    krnlNodeUrl: process.env.KRNL_NODE_URL || "",
    globalContractAddress: contractAddress,
    metadataBaseUrl: globalMetadataBaseUri
  };
};
