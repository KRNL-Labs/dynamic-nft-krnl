import { Request, Response, Router } from "express";
import { prisma } from "../db";
import { readUintTrait } from "../services/chainTraitService";
import { getObjectBuffer, getPublicUrl, objectExists, uploadObject } from "../services/s3Service";
import { createHash } from "crypto";
import sharp from "sharp";

const router = Router();

const buildMetadataResponse = async (brandId: string, tokenId: string, res: Response) => {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) {
    return res.status(404).json({ error: "Brand not found" });
  }

  const config = await prisma.brandNftConfig.findUnique({ where: { brandId } });
  if (!config) {
    return res.status(404).json({ error: "NFT config not found" });
  }
  if (!config.activeAssetPackId) {
    return res.status(404).json({ error: "Active asset pack not configured" });
  }

  const pack = await prisma.nftAssetPack.findFirst({
    where: { id: config.activeAssetPackId, brandId }
  });
  if (!pack) {
    return res.status(404).json({ error: "Asset pack not found" });
  }

  const [rarity, xp, level] = await Promise.all([
    readUintTrait({
      rpcUrl: config.rpcUrl,
      contractAddress: config.contractAddress,
      tokenId,
      traitKey: "RARITY"
    }),
    readUintTrait({
      rpcUrl: config.rpcUrl,
      contractAddress: config.contractAddress,
      tokenId,
      traitKey: "XP"
    }),
    readUintTrait({
      rpcUrl: config.rpcUrl,
      contractAddress: config.contractAddress,
      tokenId,
      traitKey: "LEVEL"
    })
  ]);

  const rarityValue = rarity.toString();
  const mapping = await prisma.nftStateMapping.findFirst({
    where: { assetPackId: pack.id, traitName: "RARITY", traitValue: rarityValue },
    include: { imageObject: true }
  });

  const imageKey = mapping?.imageObject?.objectKey ?? pack.baseImageKey;
  if (!imageKey) {
    return res.status(404).json({ error: "No image configured for this asset pack" });
  }

  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  const imageUrl = publicBase ? `${publicBase}/render/${tokenId}.png` : getPublicUrl(imageKey);
  const animationKey = pack.previewImageKey ?? imageKey;
  const animationUrl = getPublicUrl(animationKey);

  return res.json({
    name: `${brand.name} #${tokenId}`,
    description: `Dynamic NFT rewards for ${brand.name}`,
      image: imageUrl,
      animation_url: animationUrl,
      attributes: [
        { trait_type: "XP", value: Number(xp) },
        { trait_type: "LEVEL", value: Number(level) },
        { trait_type: "RARITY", value: Number(rarity) }
      ]
    });
};

router.get(
  "/render/:tokenId.png",
  async (req: Request<{ tokenId: string }>, res: Response) => {
    const { tokenId } = req.params;

    try {
      if (!tokenId) {
        return res.status(400).json({ error: "Invalid tokenId" });
      }
      const token = await prisma.token.findUnique({ where: { tokenId } });
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }

      const brandId = token.brandId;
      const config = await prisma.brandNftConfig.findUnique({ where: { brandId } });
      if (!config || !config.activeAssetPackId) {
        return res.status(404).json({ error: "Active asset pack not configured" });
      }

      const pack = await prisma.nftAssetPack.findFirst({
        where: { id: config.activeAssetPackId, brandId }
      });
      if (!pack || !pack.baseImageKey) {
        return res.status(404).json({ error: "Base image not configured" });
      }

      const activeTraits = await prisma.unlockedTrait.findMany({
        where: { brandId, tokenId, isActive: true }
      });
      const traitPairs = activeTraits
        .map((trait) => `${trait.traitKey}:${trait.traitValue}`)
        .sort();

      const hashInput = JSON.stringify({
        base: pack.baseImageKey,
        traits: traitPairs
      });
      const activeTraitsHash = createHash("sha256").update(hashInput).digest("hex");
      const cacheKey = `renders/${tokenId}/${activeTraitsHash}.png`;

      if (await objectExists(cacheKey)) {
        const cached = await getObjectBuffer(cacheKey);
        res.setHeader("Content-Type", "image/png");
        return res.send(cached);
      }

      const baseBuffer = await getObjectBuffer(pack.baseImageKey);
      let image = sharp(baseBuffer).png();

      if (traitPairs.length > 0) {
        const layers = await prisma.nftAssetObject.findMany({
          where: {
            brandId,
            assetPackId: pack.id,
            kind: "layer",
            stateKey: { in: traitPairs }
          },
          orderBy: { stateKey: "asc" }
        });

        if (layers.length > 0) {
          const composites = await Promise.all(
            layers.map(async (layer) => ({
              input: await getObjectBuffer(layer.objectKey)
            }))
          );
          image = image.composite(composites);
        }
      }

      const rendered = await image.png().toBuffer();
      await uploadObject({
        key: cacheKey,
        body: rendered,
        contentType: "image/png"
      });

      res.setHeader("Content-Type", "image/png");
      return res.send(rendered);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to render image" });
    }
  }
);

router.get(
  "/metadata/:tokenId",
  async (req: Request<{ tokenId: string }>, res: Response) => {
    const { tokenId } = req.params;

    try {
      if (!tokenId) {
        return res.status(400).json({ error: "Invalid tokenId" });
      }
      const token = await prisma.token.findUnique({ where: { tokenId } });
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      return await buildMetadataResponse(token.brandId, tokenId, res);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
