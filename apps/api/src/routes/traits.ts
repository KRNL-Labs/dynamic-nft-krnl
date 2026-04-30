import { Request, Response, Router } from "express";
import { getTraitSchema } from "../services/traitSchema";

const router = Router();

router.get("/traits/schema", (_req: Request, res: Response) => {
  res.json(getTraitSchema());
});

export default router;
