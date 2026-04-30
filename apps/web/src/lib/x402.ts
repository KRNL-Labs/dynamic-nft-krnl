"use client";

import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { KRNL_CHAIN_ID } from "./chain";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type AcceptRequirement = {
  network?: string;
  asset?: string;
  payTo?: string;
  maxAmountRequired?: string | number;
  paymentRequired?: { amount?: string | number };
  extra?: {
    decimals?: number;
    unit?: string;
    name?: string;
    version?: string;
    maxTimeoutSeconds?: number;
  };
};

type PaymentRequiredPayload = {
  x402Version?: number;
  accepts?: AcceptRequirement[];
  resource?: { url?: string; description?: string; mimeType?: string };
};

type TransferAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

type PaymentPayload = {
  x402Version: number;
  resource: { url: string; description?: string; mimeType?: string };
  accepted: AcceptRequirement;
  payload: {
    signature: string;
    authorization: TransferAuthorization;
  };
};

function getAtomicAmount(accept: AcceptRequirement): string {
  const max = accept.maxAmountRequired;
  if (typeof max === "string" && /^\d+$/.test(max)) {
    return max;
  }

  const unit = accept.extra?.unit;
  const decimals = accept.extra?.decimals;
  const extraAmount = (accept.extra as { amount?: string } | undefined)?.amount;

  if (unit === "human" && typeof decimals === "number" && extraAmount) {
    const [intPartRaw, fracRaw = ""] = extraAmount.split(".");
    const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || "0";
    const fracPadded = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
    const atomic = `${intPart}${fracPadded}`.replace(/^0+(?=\d)/, "") || "0";
    return atomic;
  }

  if (unit === "atomic" && extraAmount) {
    return extraAmount;
  }

  throw new Error("Unable to determine atomic payment amount.");
}

const base64Decode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    return window.atob(padded);
  }
  return Buffer.from(padded, "base64").toString("utf-8");
};

const base64Encode = (value: string) => {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(value);
  }
  return Buffer.from(value, "utf-8").toString("base64");
};

const toHex = (bytes: Uint8Array) =>
  `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

const parseChainId = () => KRNL_CHAIN_ID;

export async function parsePaymentRequired(response: Response): Promise<PaymentRequiredPayload> {
  const header =
    response.headers.get("PAYMENT-REQUIRED") ??
    response.headers.get("payment-required");
  if (header) {
    try {
      const decoded = base64Decode(header);
      const parsed = JSON.parse(decoded) as PaymentRequiredPayload;
      return parsed;
    } catch {
      // fall through
    }
  }
  try {
    const body = (await response.clone().json()) as PaymentRequiredPayload;
    return body ?? {};
  } catch {
    return {};
  }
}

export async function buildEip3009PaymentPayload(params: {
  accept: AcceptRequirement;
  resourceUrl: string;
  fromAddress: string;
  provider: EthereumProvider;
}): Promise<PaymentPayload> {
  const { accept, resourceUrl, fromAddress, provider } = params;
  const chainId = parseChainId();
  const name = accept.extra?.name ?? "USDC";
  const version = accept.extra?.version ?? "2";
  const to = accept.payTo ?? "";
  const verifyingContract = accept.asset ?? "";

  if (!to || !verifyingContract) {
    throw new Error("Payment requirement missing payTo or asset");
  }

  const valueAtomic = getAtomicAmount(accept);
  if (process.env.NODE_ENV !== "production") {
    console.debug(
      "[x402] atomicAmount",
      valueAtomic,
      "accept.maxAmountRequired",
      accept.maxAmountRequired,
      "extra",
      accept.extra,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const maxTimeout = accept.extra?.maxTimeoutSeconds ?? 900;
  const validAfter = now - 10;
  const validBefore = now + maxTimeout;

  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = toHex(nonceBytes);

  const domain = {
    name,
    version,
    chainId,
    verifyingContract,
  };

  const types = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = {
    from: fromAddress,
    to,
    value: BigInt(valueAtomic),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  };

  const walletClient = createWalletClient({
    account: fromAddress as `0x${string}`,
    chain: sepolia,
    transport: custom(provider),
  });

  const signature = await walletClient.signTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  const authorization: TransferAuthorization = {
    from: fromAddress,
    to,
    value: valueAtomic,
    validAfter: String(validAfter),
    validBefore: String(validBefore),
    nonce,
  };

  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: "",
      mimeType: "application/json",
    },
    accepted: accept,
    payload: {
      signature,
      authorization,
    },
  };
}

export function encodePaymentSignatureHeader(payload: PaymentPayload): string {
  return base64Encode(JSON.stringify(payload));
}
