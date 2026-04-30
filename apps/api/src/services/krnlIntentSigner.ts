import { privateKeyToAccount } from "viem/accounts";
import { getAddress, Hex } from "viem";

export type SignedIntent = {
  intentId: string;
  deadline: number;
  signature: string;
  sender: string;
  delegate: string;
  chainId: number;
  verifyingContract: string;
};

type SignIntentArgs = {
  sender: string;
  delegate: string;
  chainId: number;
  verifyingContract: string;
  intentId?: string;
  deadline?: number;
};

const normalizeHex = (value: string) =>
  value.startsWith("0x") ? value : (`0x${value}` as Hex);

const requirePrivateKey = () => {
  const key = process.env.KRNL_SENDER_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "KRNL_SENDER_PRIVATE_KEY missing: required for platform-signed workflows"
    );
  }
  return normalizeHex(key) as Hex;
};

const getDomain = (chainId: number, verifyingContract: string) => {
  return {
    name: process.env.KRNL_INTENT_DOMAIN_NAME || "KRNL Intent",
    version: process.env.KRNL_INTENT_DOMAIN_VERSION || "1",
    chainId,
    verifyingContract: getAddress(verifyingContract)
  };
};

const intentTypes = {
  Intent: [
    { name: "id", type: "bytes32" },
    { name: "sender", type: "address" },
    { name: "delegate", type: "address" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

export const signKrnlIntent = async ({
  sender,
  delegate,
  chainId,
  verifyingContract,
  intentId,
  deadline
}: SignIntentArgs): Promise<SignedIntent> => {
  const account = privateKeyToAccount(requirePrivateKey());
  const normalizedSender = getAddress(sender);
  const normalizedDelegate = getAddress(delegate);
  const normalizedContract = getAddress(verifyingContract);
  const finalIntentId = intentId ?? "0x";
  if (!/^0x[a-fA-F0-9]{64}$/.test(finalIntentId)) {
    throw new Error("TRANSACTION_INTENT_ID must be a 32-byte hex string");
  }
  const finalDeadline = deadline ?? Math.floor(Date.now() / 1000) + 600;

  const signature = await account.signTypedData({
    domain: getDomain(chainId, normalizedContract),
    types: intentTypes,
    primaryType: "Intent",
    message: {
      id: finalIntentId as Hex,
      sender: normalizedSender,
      delegate: normalizedDelegate,
      deadline: BigInt(finalDeadline)
    }
  });

  return {
    intentId: finalIntentId,
    deadline: finalDeadline,
    signature,
    sender: normalizedSender,
    delegate: normalizedDelegate,
    chainId,
    verifyingContract: normalizedContract
  };
};
