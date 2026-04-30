import { Contract, JsonRpcProvider } from "ethers";
import { Request, Response, Router } from "express";
import { prisma } from "../db";
import { resolveGlobalMetadataBaseUri } from "../services/systemConfig";
import { processZealyEvent } from "../services/zealyEventProcessor";

const router = Router();

const requireInternalApiKey = (req: Request, res: Response): boolean => {
  const expected = process.env.INTERNAL_API_KEY;
  const provided = req.header("x-internal-api-key");
  if (!expected || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
};

router.post("/internal/zealy-events/:id/process", async (req: Request, res: Response) => {
  if (!requireInternalApiKey(req, res)) return;

  const { id } = req.params;
  try {
    const event = await prisma.zealyEvent.findUnique({ where: { id } });
    if (!event) {
      return res.status(404).json({ error: "Zealy event not found" });
    }

    try {
      const result = await processZealyEvent(event);
      return res.json({ ok: true, txHash: result.txHash ?? null });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Workflow processing failed" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/internal/nft/base-uri", async (req: Request, res: Response) => {
  if (!requireInternalApiKey(req, res)) return;

  const expected = resolveGlobalMetadataBaseUri();
  const rpcUrl = process.env.RPC_SEPOLIA_URL || process.env.SEPOLIA_RPC_URL;
  const contractAddress = process.env.DEFAULT_NFT_CONTRACT_ADDRESS;
  if (!rpcUrl) {
    return res.status(500).json({ error: "RPC_SEPOLIA_URL is not configured" });
  }
  if (!contractAddress) {
    return res.status(500).json({ error: "DEFAULT_NFT_CONTRACT_ADDRESS is not set" });
  }

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(
      contractAddress,
      ["function metadataBaseURI() view returns (string)"],
      provider
    );
    const onchainBaseUri = await contract.metadataBaseURI();
    res.json({
      onchainBaseUri,
      expectedGlobalMetadataBaseUri: expected ?? null,
      matches: expected ? onchainBaseUri === expected : false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to read on-chain base URI" });
  }
});

export default router;
