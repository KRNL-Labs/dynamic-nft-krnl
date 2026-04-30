import { prisma } from "../db";

export const upsertTokenRecord = async (args: {
  tokenId: string;
  brandId: string;
  ownerAddress?: string | null;
}) => {
  const { tokenId, brandId, ownerAddress } = args;
  if (!tokenId) return;
  await prisma.token.upsert({
    where: { tokenId },
    update: {
      brandId,
      ...(ownerAddress ? { ownerAddress } : {})
    },
    create: {
      tokenId,
      brandId,
      ownerAddress: ownerAddress ?? null
    }
  });
};
