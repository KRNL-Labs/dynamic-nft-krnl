import { createHash, randomUUID } from "crypto";
import { Interface, JsonRpcProvider } from "ethers";
import { prisma } from "../db";
import { pollUntilTxHashStrict, submitMintWorkflow } from "./krnlService";
import { upsertTokenRecord } from "./tokenService";

const BASE_NFT_MINTED_ABI = ["event BaseNFTMinted(address indexed user, uint256 tokenId)"];
const DEMO_MODE = String(process.env.DEMO_MODE || "").toLowerCase() === "true";

export const extractTokenIdFromMintReceipt = async (args: {
  rpcUrl: string;
  contractAddress: string;
  txHash: string;
  expectedUserWallet: string;
}): Promise<string> => {
  const { rpcUrl, contractAddress, txHash, expectedUserWallet } = args;
  const provider = new JsonRpcProvider(rpcUrl);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error("Mint transaction receipt not found");
  }

  const iface = new Interface(BASE_NFT_MINTED_ABI);
  const normalizedContract = contractAddress.toLowerCase();
  const expectedWallet = expectedUserWallet.toLowerCase();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== normalizedContract) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "BaseNFTMinted") {
        const mintedFor = String(parsed.args[0]).toLowerCase();
        if (mintedFor === expectedWallet) {
          return (parsed.args[1] as bigint).toString();
        }
      }
    } catch {
      // ignore unrelated logs
    }
  }

  throw new Error("BaseNFTMinted event not found in mint transaction");
};

export type EnsureBaseNftMintResult = {
  state: "minted" | "submitted";
  tokenId: string | null;
  runId: string | null;
  requestId: string | null;
  intentId: string | null;
};

const deriveDemoTokenId = (brandId: string, wallet: string) => {
  const seed = `${brandId.toLowerCase()}:${wallet.toLowerCase()}`;
  const digest = createHash("sha256").update(seed).digest("hex");
  const value = BigInt(`0x${digest.slice(0, 15)}`) + BigInt(1);
  return value.toString(10);
};

const persistMintedToken = async (brandId: string, wallet: string, tokenId: string) => {
  await prisma.brandMembership.upsert({
    where: { brandId_wallet_role: { brandId, wallet, role: "evolving" } },
    update: { tokenId },
    create: { brandId, wallet, tokenId, role: "evolving" }
  });

  await prisma.tokenOwnership.upsert({
    where: { brandId_tokenId: { brandId, tokenId } },
    update: { walletAddress: wallet },
    create: { brandId, tokenId, walletAddress: wallet }
  });

  await upsertTokenRecord({ tokenId, brandId, ownerAddress: wallet });

  await prisma.brandUserLedger.upsert({
    where: { brandId_walletAddress: { brandId, walletAddress: wallet } },
    update: { tokenId },
    create: { brandId, walletAddress: wallet, tokenId }
  });
};

export const resolveEvolvingTokenId = async (args: {
  brandId: string;
  wallet: string;
}): Promise<string> => {
  const { brandId, wallet } = args;

  const existing = await prisma.brandMembership.findFirst({
    where: { brandId, wallet, role: "evolving" }
  });
  if (existing) {
    await upsertTokenRecord({
      tokenId: existing.tokenId,
      brandId,
      ownerAddress: wallet
    });
    return existing.tokenId;
  }

  const brandConfig = await prisma.brandNftConfig.findUnique({ where: { brandId } });
  if (!brandConfig) {
    throw new Error("NFT config not found for brand");
  }

  const workflow = await submitMintWorkflow({ brandId, walletAddress: wallet });
  const txHash = await pollUntilTxHashStrict(workflow.workflowRunId);
  const tokenId = await extractTokenIdFromMintReceipt({
    rpcUrl: brandConfig.rpcUrl,
    contractAddress: brandConfig.contractAddress,
    txHash,
    expectedUserWallet: wallet
  });

  await prisma.brandMembership.create({
    data: {
      brandId,
      wallet,
      tokenId,
      role: "evolving"
    }
  });
  await upsertTokenRecord({ tokenId, brandId, ownerAddress: wallet });

  return tokenId;
};

export const ensureBaseNftMinted = async (
  brandId: string,
  wallet: string
): Promise<EnsureBaseNftMintResult> => {
  await prisma.brandUser.upsert({
    where: { brandId_walletAddress: { brandId, walletAddress: wallet } },
    update: {},
    create: { brandId, walletAddress: wallet }
  });

  const ledger = await prisma.brandUserLedger.findUnique({
    where: { brandId_walletAddress: { brandId, walletAddress: wallet } }
  });
  if (ledger?.tokenId) {
    return {
      state: "minted",
      tokenId: ledger.tokenId,
      runId: null,
      requestId: null,
      intentId: null
    };
  }

  const membership = await prisma.brandMembership.findFirst({
    where: { brandId, wallet, role: "evolving" }
  });
  const ownership = await prisma.tokenOwnership.findFirst({
    where: { brandId, walletAddress: wallet }
  });
  const existingTokenId = membership?.tokenId ?? ownership?.tokenId;
  if (existingTokenId) {
    await persistMintedToken(brandId, wallet, existingTokenId);
    return {
      state: "minted",
      tokenId: existingTokenId,
      runId: null,
      requestId: null,
      intentId: null
    };
  }
  const pendingRun = await prisma.workflowRun.findFirst({
    where: {
      brandId,
      wallet,
      type: "MINT_BASE_NFT",
      status: { in: ["queued", "running"] }
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, requestId: true, txIntentId: true, intentId: true }
  });
  if (pendingRun) {
    return {
      state: "submitted",
      tokenId: null,
      runId: pendingRun.id,
      requestId: pendingRun.requestId ?? null,
      intentId: pendingRun.txIntentId ?? pendingRun.intentId ?? null
    };
  }
  if (DEMO_MODE) {
    const tokenId = deriveDemoTokenId(brandId, wallet);
    const runId = randomUUID();
    const requestId = randomUUID();
    await prisma.workflowRun.create({
      data: {
        id: runId,
        brandId,
        type: "MINT_BASE_NFT",
        workflowName: "mint-base-nft",
        status: "queued",
        wallet,
        tokenId,
        krnlRunRef: requestId,
        requestId,
        intentId: null,
        txIntentId: null,
        renderedWorkflowJson: {
          metadata: {
            demo: true,
            action: "mint-base-nft",
            brandId,
            wallet,
            payload: { brandId, wallet, tokenId }
          }
        }
      }
    });
    await persistMintedToken(brandId, wallet, tokenId);
    return {
      state: "minted",
      tokenId,
      runId,
      requestId,
      intentId: null
    };
  }

  const workflow = await submitMintWorkflow({
    brandId,
    walletAddress: wallet,
    workflowRunType: "MINT_BASE_NFT"
  });
  console.log(
    `[mint] submitted brandId=${brandId} wallet=${wallet} txIntentId=${workflow.txIntentId ?? workflow.intentId ?? ""} requestId=${workflow.requestId ?? ""} runId=${workflow.workflowRunId}`
  );
  return {
    state: "submitted",
    tokenId: null,
    runId: workflow.workflowRunId,
    requestId: workflow.requestId ?? null,
    intentId: workflow.txIntentId ?? workflow.intentId ?? null
  };
};
