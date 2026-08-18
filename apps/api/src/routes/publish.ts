import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

const router = Router();

const PublishSchema = z.object({
  projectId: z.string(),
  platforms: z.array(z.enum(["YouTube", "TikTok", "Instagram", "Facebook"])),
  title: z.string().optional(),
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  schedulePerPlatform: z.record(z.string()).optional(), // platform → ISO datetime
});

// ── Create publish jobs ──────────────────────────────────────────────────────
router.post("/", optionalAuth, async (req, res) => {
  const parsed = PublishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const { projectId, platforms, title, caption, hashtags, scheduledAt, schedulePerPlatform } = parsed.data;

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status !== "SUCCEEDED") {
    return res.status(400).json({ error: "Project must be in SUCCEEDED state before publishing" });
  }

  const jobs = await Promise.all(
    platforms.map(async (platform) => {
      const platformSchedule = schedulePerPlatform?.[platform];
      const scheduled = platformSchedule
        ? new Date(platformSchedule)
        : scheduledAt
        ? new Date(scheduledAt)
        : null;

      return db.publishJob.create({
        data: {
          projectId,
          platform,
          status: scheduled ? "SCHEDULED" : "QUEUED",
          scheduledAt: scheduled,
          title: title ?? project.title,
          caption: caption ?? null,
          hashtags: (hashtags ?? []) as any,
        },
      });
    })
  );

  // For QUEUED jobs (publish now), enqueue them
  for (const job of jobs) {
    if (job.status === "QUEUED") {
      const { queue } = await import("../services/queue.js");
      await queue.enqueue("publish-video", { publishJobId: job.id });
    }
  }

  res.status(202).json({ jobs, message: `${jobs.length} publish job(s) created` });
});

// ── List publish jobs ─────────────────────────────────────────────────────────
router.get("/", optionalAuth, async (req, res) => {
  const { projectId } = req.query;
  const jobs = await db.publishJob.findMany({
    where: projectId ? { projectId: String(projectId) } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { project: { select: { title: true } } },
  });
  res.json({ jobs });
});

// ── Get publish job ───────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const job = await db.publishJob.findUnique({
    where: { id: req.params.id },
    include: { project: { select: { title: true, videoPath: true } } },
  });
  if (!job) return res.status(404).json({ error: "Publish job not found" });
  res.json({ job });
});

export default router;
