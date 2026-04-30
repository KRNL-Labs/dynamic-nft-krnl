"use client";

import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export const SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "";

export function getSepoliaRpcUrl() {
  return SEPOLIA_RPC_URL;
}

export const sepoliaPublicClient = SEPOLIA_RPC_URL
  ? createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL, {
        timeout: 30000,
        retryCount: 3,
        retryDelay: 500,
      }),
    })
  : null;
