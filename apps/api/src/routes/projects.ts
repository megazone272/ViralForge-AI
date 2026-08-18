import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { queue } from "../services/queue.js";
import { runPipeline } from "../services/pipeline.js";

const router = Router();

// Register pipeline job handler (idempotent — safe to call multiple times)
queue.register("generate-video", async (job) => {
  const { projectId, userId } = job.data as { projectId: string; userId: string };
  return runPipeline({ projectId, userId });
});

const CreateSchema = z.object({
  prompt: z.string().min(3).max(500),
  language: z.string().default("English"),
  durationSec: z.number().int().min(15).max(300).default(45),
  style: z.string().default("Viral Documentary"),
  platform: z.string().default("YouTube"),
  tone: z.string().default("Engaging"),
  hookStyle: z.string().optional(),
});

// ── Create project + enqueue generation ───────────────────────────────────────
router.post("/", optionalAuth, async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  // Resolve user: authenticated or demo fallback
  let userId: string;
  if (req.user?.userId) {
    userId = req.user.userId;
  } else {
    // Demo mode: create/reuse demo user
    let demo = await db.user.findUnique({ where: { email: "demo@viralforge.local" } });
    if (!demo) demo = await db.user.create({ data: { email: "demo@viralforge.local", name: "Demo Creator" } });
    userId = demo.id;
  }

  const { prompt, language, durationSec, style, platform, tone } = parsed.data;

  // Deduct credits
  const user = await db.user.findUnique({ where: { id: userId } });
  const COST = 10; // script (1) + image*n (2ea) + tts (1) + render (5) ≈ 10
  if (user && user.creditBalance < COST) {
    return res.status(402).json({ error: "Insufficient credits", required: COST, available: user.creditBalance });
  }

  const project = await db.project.create({
    data: {
      userId,
      title: prompt.slice(0, 70),
      prompt,
      language,
      durationSec,
      style,
      platform,
      tone,
      status: "QUEUED",
    },
  });

  // Deduct credits
  if (user) {
    await db.user.update({ where: { id: userId }, data: { creditBalance: { decrement: COST } } });
    await db.creditTransaction.create({ data: { userId, amount: -COST, reason: `Video generation: ${project.id}` } });
  }

  // Enqueue background job
  const job = await queue.enqueue("generate-video", { projectId: project.id, userId });

  res.status(202).json({
    project: { ...project, jobId: job.id },
    message: "Video generation queued",
    creditsUsed: COST,
  });
});

// ── List projects ──────────────────────────────────────────────────────────────
router.get("/", optionalAuth, async (req, res) => {
  const userId = req.user?.userId;
  const where = userId ? { userId } : { user: { email: "demo@viralforge.local" } };

  const projects = await db.project.findMany({
    where: where as any,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      scenes: { orderBy: { order: "asc" } },
      _count: { select: { publishes: true } },
    },
  });
  res.json({ projects });
});

// ── Get single project ─────────────────────────────────────────────────────────
router.get("/:id", optionalAuth, async (req, res) => {
  const project = await db.project.findUnique({
    where: { id: req.params.id },
    include: {
      scenes: { orderBy: { order: "asc" } },
      publishes: { orderBy: { createdAt: "desc" } },
      analytics: { orderBy: { capturedAt: "desc" }, take: 30 },
    },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ project });
});

// ── Regenerate a single scene ─────────────────────────────────────────────────
router.post("/:id/scenes/:sceneId/regenerate", requireAuth, async (req, res) => {
  const { id, sceneId } = req.params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const scene = await db.scene.findUnique({ where: { id: sceneId } });
  if (!scene) return res.status(404).json({ error: "Scene not found" });

  const { type } = req.body as { type?: "image" | "audio" | "all" };

  if (type === "image" || type === "all") {
    const { generateImage } = await import("../ai.js");
    const { existsSync } = await import("node:fs");
    const path_ = await import("node:path");
    const storageRoot = process.env.STORAGE_DIR || "./storage";
    const outFile = path_.join(storageRoot, "projects", id, "scenes", `scene-${String(scene.order).padStart(3, "0")}`, "image.jpg");
    const imagePath = await generateImage(scene.visualPrompt, outFile);
    if (imagePath) await db.scene.update({ where: { id: sceneId }, data: { imagePath } });
  }

  if (type === "audio" || type === "all") {
    const { generateSpeech } = await import("../services/piper.js");
    const path_ = await import("node:path");
    const storageRoot = process.env.STORAGE_DIR || "./storage";
    const wavPath = path_.join(storageRoot, "projects", id, "scenes", `scene-${String(scene.order).padStart(3, "0")}`, "narration.wav");
    try {
      const audioPath = await generateSpeech({ text: scene.narration, outputPath: wavPath });
      await db.scene.update({ where: { id: sceneId }, data: { audioPath } });
    } catch (e: any) {
      return res.status(503).json({ error: `TTS failed: ${e.message}` });
    }
  }

  const updated = await db.scene.findUnique({ where: { id: sceneId } });
  res.json({ scene: updated });
});

// ── Update scene narration ────────────────────────────────────────────────────
router.patch("/:id/scenes/:sceneId", requireAuth, async (req, res) => {
  const { narration, visualPrompt } = req.body as { narration?: string; visualPrompt?: string };
  const scene = await db.scene.update({
    where: { id: req.params.sceneId },
    data: { ...(narration !== undefined && { narration }), ...(visualPrompt !== undefined && { visualPrompt }) },
  });
  res.json({ scene });
});

// ── Re-render final video ─────────────────────────────────────────────────────
router.post("/:id/render", requireAuth, async (req, res) => {
  const project = await db.project.findUnique({
    where: { id: req.params.id },
    include: { scenes: { orderBy: { order: "asc" } } },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const job = await queue.enqueue("generate-video", {
    projectId: project.id,
    userId: project.userId,
  });
  await db.project.update({ where: { id: project.id }, data: { status: "QUEUED" } });

  res.status(202).json({ message: "Re-render queued", jobId: job.id });
});

// ── Job status ────────────────────────────────────────────────────────────────
router.get("/:id/job/:jobId", async (req, res) => {
  const job = queue.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job: { id: job.id, state: job.state, attempts: job.attempts, error: job.error } });
});

export default router;
