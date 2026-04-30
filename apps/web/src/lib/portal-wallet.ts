"use client";

export type WalletLike = {
  address?: string;
  walletClientType?: string;
  connectorType?: string;
  walletType?: string;
};

function normalizeAddress(address?: string | null): string | null {
  if (!address) return null;
  return address.toLowerCase();
}

function isEmbeddedWallet(wallet: WalletLike): boolean {
  const clientType = wallet.walletClientType?.toLowerCase() ?? "";
  const connectorType = wallet.connectorType?.toLowerCase() ?? "";
  return (
    clientType === "privy" ||
    connectorType === "embedded" ||
    connectorType.includes("embedded")
  );
}

function isInjectedWallet(wallet: WalletLike): boolean {
  const clientType = wallet.walletClientType?.toLowerCase() ?? "";
  const connectorType = wallet.connectorType?.toLowerCase() ?? "";
  const walletType = wallet.walletType?.toLowerCase() ?? "";
  return (
    connectorType.includes("injected") ||
    connectorType.includes("metamask") ||
    clientType.includes("metamask") ||
    clientType.includes("injected") ||
    walletType.includes("metamask")
  );
}

export function getPortalWalletAddress(
  portalType: "brand" | "owner" | null | undefined,
  wallets: WalletLike[] | undefined,
  activeWalletAddress?: string | null,
): string | null {
  const list = Array.isArray(wallets) ? wallets : [];
  const active = normalizeAddress(activeWalletAddress);

  if (!portalType) {
    return active ?? normalizeAddress(list[0]?.address);
  }

  if (portalType === "brand") {
    const injected = list.find((wallet) => isInjectedWallet(wallet));
    return (
      normalizeAddress(injected?.address) ??
      active ??
      normalizeAddress(list[0]?.address)
    );
  }

  const embedded = list.find((wallet) => isEmbeddedWallet(wallet));
  return (
    normalizeAddress(embedded?.address) ??
    active ??
    normalizeAddress(list[0]?.address)
  );
}

export function describeWallet(wallet: WalletLike) {
  return {
    address: wallet.address ?? "—",
    walletClientType: wallet.walletClientType ?? "—",
    connectorType: wallet.connectorType ?? "—",
    walletType: wallet.walletType ?? "—",
  };
}
