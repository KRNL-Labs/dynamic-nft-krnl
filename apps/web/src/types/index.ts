export type Brand = {
  id: string;
  brandId?: string;
  name: string;
  description?: string;
  logoUrl?: string;
  joinUrl?: string;
  zealyUrl?: string;
  zealyJoinUrl?: string;
  primaryChainId?: number;
  zealyConnected?: boolean;
  hasZealyConfig?: boolean;
  zealySubdomain?: string;
  zealyCommunityId?: string;
  nftConfigured?: boolean;
  assetPackCount?: number;
  rewardRuleCount?: number;
};

export type Quest = {
  id: string;
  title: string;
  description?: string;
  zealyQuestId?: string;
  xp?: number;
  xpReward?: number;
  active?: boolean;
  rewardConfigured?: boolean;
};

export type RewardRule = {
  lootKeysDelta?: number;
  enabled?: boolean;
  label?: string;
  xpMode?: "ZEALY" | "OVERRIDE" | "NONE";
  xpOverride?: number | null;
  // backwards compatibility with existing UI/backend responses
  note?: string;
};

export type NftConfig = {
  contractAddress?: string;
  chainId?: number | string;
  rpcUrl?: string;
  activeAssetPackId?: string;
  metadataBaseURI?: string;
};

export type AssetPack = {
  id: string;
  name: string;
  description?: string;
  baseImageUrl?: string;
  previewImageUrl?: string;
};

export type AssetPackAsset = {
  id?: string;
  kind?: string;
  traitName?: string;
  traitValue?: string | number;
  objectKey?: string;
  publicUrl?: string;
};

export type MetadataPreview = {
  image?: string;
  attributes?: Array<{ trait_type?: string; value?: string | number }>;
  [key: string]: unknown;
};

export type WorkflowRun = {
  id?: string;
  runId: string;
  createdAt: string;
  updatedAt?: string;
  type?: string;
  status?: string;
  wallet?: string;
  tokenId?: string;
  krnlRequestId?: string;
  krnlIntentId?: string | null;
  krnlStatus?: string | null;
  onchainVerification?: string | null;
  onchainVerified?: boolean | null;
  requestId?: string | null;
  intentId?: string | null;
  txHash?: string | null;
  chainTxHash?: string | null;
  metadataBaseURI?: string | null;
  onchainMetadataBaseURI?: string | null;
  errorMessage?: string | null;
  krnlStatusJson?: Record<string, unknown> | null;
};

export type WorkflowDetail = {
  runId: string;
  status?: string | null;
  requestId?: string | null;
  intentId?: string | null;
  krnlRequestId?: string | null;
  krnlIntentId?: string | null;
  krnlStatus?: string | null;
  onchainVerification?: string | null;
  onchainVerified?: boolean | null;
  chainTxHash?: string | null;
  txHash?: string | null;
  metadataBaseURI?: string | null;
  onchainMetadataBaseURI?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  renderedWorkflowJson?: Record<string, unknown>;
};

export type UserTrait = {
  id?: string;
  traitId?: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  traitKey?: string;
  traitValue?: string;
  unlockedAt?: string;
  isActive?: boolean;
  [key: string]: unknown;
};

export type Credits = {
  credits: number;
};

export type PortalInfo = {
  portalType?: "brand" | "owner" | null;
  brandId?: string | null;
};

export type ZealyEvent = {
  id?: string;
  type?: string;
  status?: string;
  zealyQuestId?: string;
  walletAddress?: string;
  createdAt?: string;
  processedAt?: string;
  payload?: Record<string, unknown>;
};

export type SystemConfig = {
  globalMetadataBaseUri?: string;
  globalMetadataBaseURI?: string;
  metadataBaseUri?: string;
  metadataBaseURI?: string;
  GLOBAL_METADATA_BASE_URI?: string;
  xpPerLootKey?: number;
  xp_per_loot_key?: number;
  traitMetadataUri?: string;
  traitMetadataURI?: string;
  erc7496Supported?: boolean;
  contractAddress?: string;
  globalContractAddress?: string;
  chainId?: number | string;
  globalChainId?: number | string;
  onchainMetadataBaseUri?: string;
  onchainMetadataBaseURI?: string;
  onchainBaseURI?: string;
  matches?: boolean;
  [key: string]: unknown;
};

export type TraitSchemaItem = {
  key?: string;
  traitKey?: string;
  id?: string;
  name?: string;
  label?: string;
  description?: string;
  constraints?: unknown;
  options?: unknown;
  values?: unknown;
  [key: string]: unknown;
};

export type LootboxConfig = {
  enabled?: boolean;
  xpPerLootKey?: number;
  lootKeysPerOpen?: number;
  xpCostToOpen?: number;
  maxUnlocksPerOpen?: number;
  lootTable?: LootboxTableRow[];
  items?: LootboxTableRow[];
};

export type LootboxTableRow = {
  traitName?: string;
  traitValue?: string;
  weight?: number;
  [key: string]: unknown;
};
