import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { prisma } from "../db";

const DEFAULT_CHAIN_ID = 11155111;
const DEFAULT_REFERENCE =
  "0x9969827E2CB0582e08787B23F641b49Ca82bc774";

const getChainId = () => {
  const raw =
    process.env.KRNL_DEFAULT_CHAIN_ID ||
    process.env.KRNL_CHAIN_ID ||
    process.env.CHAIN_ID;
  const parsed = raw ? Number(raw) : DEFAULT_CHAIN_ID;
  return Number.isFinite(parsed) ? parsed : DEFAULT_CHAIN_ID;
};

const getRpcUrl = () =>
  process.env.RPC_SEPOLIA_URL ||
  process.env.SEPOLIA_RPC_URL ||
  process.env.KRNL_DEFAULT_RPC_URL ||
  "";

const getSenderAddress = () => {
  const sender = process.env.KRNL_SENDER_ADDRESS;
  if (!sender) {
    throw new Error("KRNL_SENDER_ADDRESS not configured");
  }
  return getAddress(sender);
};

const getReferenceAddress = () =>
  getAddress(
    process.env.KRNL_DELEGATED_ACCOUNT_ADDRESS ||
      process.env.KRNL_7702_REFERENCE ||
      DEFAULT_REFERENCE
  );

const getBootstrapSignerKey = () =>
  process.env.KRNL_SENDER_PRIVATE_KEY || process.env.KRNL_INTENT_SIGNER_PK || "";

const parseRequiredBigInt = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  const parsed = BigInt(value);
  if (parsed < 0) {
    throw new Error(`${name} must be positive`);
  }
  return parsed;
};

const safeStringify = (value: unknown) =>
  JSON.stringify(value, (_key, val) => (typeof val === "bigint" ? val.toString() : val));

const upsertStatus = async (
  chainId: number,
  senderAddress: string,
  data: {
    status: string;
    txHash?: string | null;
    errorMessage?: string | null;
    lastAttemptAt?: Date | null;
  }
) => {
  await prisma.krnlExecutorBootstrap.upsert({
    where: { chainId_senderAddress: { chainId, senderAddress } },
    update: {
      status: data.status,
      txHash: data.txHash ?? undefined,
      errorMessage: data.errorMessage ?? undefined,
      lastAttemptAt: data.lastAttemptAt ?? undefined
    },
    create: {
      chainId,
      senderAddress,
      status: data.status,
      txHash: data.txHash ?? undefined,
      errorMessage: data.errorMessage ?? undefined,
      lastAttemptAt: data.lastAttemptAt ?? undefined
    }
  });
};

export const ensure7702Delegation = async (
  senderAddress: string,
  delegatedAccountAddress: string
) => {
  const chainId = getChainId();
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) {
    throw new Error("RPC_SEPOLIA_URL is not configured");
  }

  const privateKey = getBootstrapSignerKey();
  if (!privateKey) {
    throw new Error(
      "KRNL_SENDER_PRIVATE_KEY missing: required for platform-signed workflows"
    );
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  if (account.address.toLowerCase() !== senderAddress.toLowerCase()) {
    throw new Error("KRNL_SENDER_PRIVATE_KEY does not match KRNL_SENDER_ADDRESS");
  }
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
  });
  const walletClient = createWalletClient({
    chain: sepolia,
    transport: http(rpcUrl),
    account
  });

  const actualChainId = await publicClient.getChainId();
  const code =
    (await publicClient
      .getBytecode({ address: senderAddress as `0x${string}` })
      .catch(() => undefined)) ?? "0x";
  console.log(
    `7702 check: chainId=${actualChainId}, code length=${code.length}, code=${code.slice(
      0,
      12
    )}`
  );

  const codeLower = code.toLowerCase();
  const alreadyDelegated = codeLower.startsWith("0xef0100");

  if (alreadyDelegated) {
    console.log(`7702 delegated: true`);
    return { delegated: true };
  }

  const txNonce = await publicClient.getTransactionCount({
    address: senderAddress as `0x${string}`,
    blockTag: "pending"
  });
  const authNonce = txNonce + 1;

  const authorization = await account.signAuthorization({
    contractAddress: delegatedAccountAddress as `0x${string}`,
    chainId,
    nonce: authNonce
  });

  const maxFeePerGas = parseRequiredBigInt(
    process.env.KRNL_MAX_FEE_PER_GAS,
    "KRNL_MAX_FEE_PER_GAS"
  );
  const maxPriorityFeePerGas = parseRequiredBigInt(
    process.env.KRNL_MAX_PRIORITY_FEE_PER_GAS,
    "KRNL_MAX_PRIORITY_FEE_PER_GAS"
  );

  const txRequest = {
    to: senderAddress as `0x${string}`,
    data: "0x" as `0x${string}`,
    value: BigInt(0),
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: txNonce,
    chainId,
    type: "eip7702" as const,
    authorizationList: [authorization] as const
  };

  const estimatedGas = await publicClient.estimateGas({
    ...txRequest,
    account: senderAddress as `0x${string}`
  });
  const gasFloor = BigInt(60000);
  const gasBuffer = BigInt(20000);
  const finalGas = estimatedGas + gasBuffer > gasFloor ? estimatedGas + gasBuffer : gasFloor;

  const signedTx = await walletClient.signTransaction({
    ...txRequest,
    account,
    chain: sepolia,
    gas: finalGas
  });

  const hash = await publicClient.sendRawTransaction({
    serializedTransaction: signedTx
  });

  console.log(
    `7702 bootstrap nonce=${txNonce}, estimatedGas=${estimatedGas}, finalGas=${finalGas}, tx=${hash}`
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(
    `7702 receipt status=${receipt.status ?? "unknown"} type=${
      (receipt as { type?: string }).type ?? "unknown"
    }`
  );

  const postCode =
    (await publicClient
      .getBytecode({ address: senderAddress as `0x${string}` })
      .catch(() => undefined)) ?? "0x";
  console.log(`7702 code after bootstrap=${postCode.slice(0, 12)}`);
  const postLower = postCode.toLowerCase();
  const delegated = postLower.startsWith("0xef0100");
  console.log(`7702 delegated: ${delegated}`);

  if (receipt.status !== "success" || !delegated) {
    const err = `EIP-7702 delegation failed (rpc=${rpcUrl})`;
    const details = {
      sender: senderAddress,
      chainId: actualChainId,
      nonce: txNonce,
      authorizationNonce: authNonce,
      hash,
      receipt: {
        status: receipt.status,
        type: (receipt as { type?: string }).type,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash
      },
      codeAfter: postCode
    };
    throw new Error(`${err} ${safeStringify(details)}`);
  }
  return { delegated: true, txHash: hash };
};

export const ensureExecutorBootstrapped = async () => {
  const senderAddress = getSenderAddress();
  const delegatedAccountAddress = getReferenceAddress();
  const chainId = getChainId();

  const existing = await prisma.krnlExecutorBootstrap.findUnique({
    where: { chainId_senderAddress: { chainId, senderAddress } }
  });

  if (existing?.status === "completed") {
    return { status: "completed", txHash: existing.txHash ?? undefined };
  }

  try {
    const result = await ensure7702Delegation(senderAddress, delegatedAccountAddress);
    await upsertStatus(chainId, senderAddress, {
      status: "completed",
      txHash: result.txHash ?? existing?.txHash ?? null,
      errorMessage: null,
      lastAttemptAt: new Date()
    });
    return { status: "completed", txHash: result.txHash ?? existing?.txHash ?? undefined };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to bootstrap executor";
    await upsertStatus(chainId, senderAddress, {
      status: "failed",
      errorMessage: message,
      lastAttemptAt: new Date()
    });
    throw error;
  }
};
