export interface Brand {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  primaryChainId: number;
  hasZealyConfig: boolean;
  sponsorshipCredits: number;
  ownerUserId: string;
  zealySubdomain?: string;
}

export interface Quest {
  brandId: string;
  id: string;
  zealyQuestId: string;
  title: string;
  description: string;
  xpReward: number;
  active: boolean;
}

export interface Membership {
  brandId: string;
  userId: string;
  walletAddress: string;
  tokens: Array<{ tokenId: string }>;
}

export type PaymentStatus = "pending" | "completed";

export interface Payment {
  paymentId: string;
  brandId: string;
  amount: number;
  status: PaymentStatus;
}

export const brands: Brand[] = [
  {
    id: "brand_123",
    name: "Acme Corp",
    description: "Acme quest community",
    logoUrl: "https://example.com/logo.png",
    primaryChainId: 8453,
    hasZealyConfig: true,
    sponsorshipCredits: 120.5,
    ownerUserId: "user_1",
    zealySubdomain: "acme-community"
  }
];

export const quests: Quest[] = [
  {
    brandId: "brand_123",
    id: "quest_1",
    zealyQuestId: "zealy_q_123",
    title: "Follow us on Twitter",
    description: "Follow @acme on Twitter",
    xpReward: 50,
    active: true
  }
];

export const memberships: Membership[] = [
  {
    brandId: "brand_123",
    userId: "user_1",
    walletAddress: "0xUserWallet",
    tokens: [{ tokenId: "1" }]
  }
];

export const payments: Payment[] = [];
