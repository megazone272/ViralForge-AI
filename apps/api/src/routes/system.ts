import { Router } from "express";
import { getSystemStatus } from "../services/system.js";

const router = Router();

router.get("/status", async (_req, res) => {
  const status = await getSystemStatus();
  res.json({ status });
});

router.get("/status/refresh", async (_req, res) => {
  const status = await getSystemStatus(true);
  res.json({ status });
});

export default router;
