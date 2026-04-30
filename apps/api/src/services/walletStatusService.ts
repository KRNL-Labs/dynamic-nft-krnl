import { JsonRpcProvider, isAddress } from "ethers";

const DEFAULT_CHAIN_ID = 11155111;

let provider: JsonRpcProvider | null = null;

const getRpcUrl = () => {
  return (
    process.env.RPC_SEPOLIA_URL ||
    process.env.SEPOLIA_RPC_URL ||
    process.env.KRNL_DEFAULT_RPC_URL ||
    ""
  );
};

const getProvider = () => {
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) {
    throw new Error("RPC_SEPOLIA_URL is not set");
  }
  if (!provider) {
    provider = new JsonRpcProvider(rpcUrl);
  }
  return provider;
};

export const getWalletStatus = async (walletAddress: string) => {
  if (!isAddress(walletAddress)) {
    throw new Error("Invalid wallet address");
  }
  const chainId = Number(process.env.KRNL_DEFAULT_CHAIN_ID || DEFAULT_CHAIN_ID);
  const code = await getProvider().getCode(walletAddress);
  const isDelegated = !!code && code !== "0x";
  return { walletAddress, chainId, isDelegated };
};
