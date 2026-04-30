import { Request, Response, Router } from "express";
import { buildSystemConfigResponse } from "../services/systemConfig";

const router = Router();

router.get("/system/config", (_req: Request, res: Response) => {
  try {
    res.json(buildSystemConfigResponse());
  } catch (error) {
    return res.status(500).json({ error: "GLOBAL_METADATA_BASE_URI not configured" });
  }
});

export default router;
