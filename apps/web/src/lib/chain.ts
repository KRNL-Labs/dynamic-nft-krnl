"use client";

import { getSepoliaRpcUrl } from "@/lib/viem";

export const KRNL_CHAIN_ID = 11155111;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const SEPOLIA_RPC_URL = getSepoliaRpcUrl();

const SEPOLIA_PARAMS = {
  chainId: "0xaa36a7",
  chainName: "Sepolia",
  nativeCurrency: {
    name: "Sepolia Ether",
    symbol: "SEP",
    decimals: 18,
  },
  rpcUrls: SEPOLIA_RPC_URL ? [SEPOLIA_RPC_URL] : [],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

const toHexChainId = (chainId: number) => `0x${chainId.toString(16)}`;

export async function getChainId(provider: EthereumProvider): Promise<number> {
  const hex = (await provider.request({ method: "eth_chainId" })) as string;
  return parseInt(hex, 16);
}

export async function ensureChain(
  provider: EthereumProvider,
  targetChainId: number,
): Promise<void> {
  const targetHex = toHexChainId(targetChainId).toLowerCase();
  const current = await getChainId(provider).catch(() => null);
  if (current === targetChainId) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    const message = String(
      (err as { message?: string }).message ?? "",
    ).toLowerCase();
    const unknownChain =
      code === 4902 ||
      message.includes("unknown chain") ||
      message.includes("unrecognized chain");

    if (!unknownChain) {
      throw new Error("Chain switch failed");
    }

    if (!SEPOLIA_RPC_URL) {
      throw new Error("Missing NEXT_PUBLIC_SEPOLIA_RPC_URL");
    }

    const params = SEPOLIA_PARAMS;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [params],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
  }

  const after = await getChainId(provider).catch(() => null);
  if (after !== targetChainId) {
    throw new Error("Chain switch failed");
  }
}
