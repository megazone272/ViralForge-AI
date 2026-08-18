import { Router } from "express";
import { db } from "../db.js";
import { optionalAuth } from "../middleware/auth.js";

const router = Router();

// ── Project analytics ─────────────────────────────────────────────────────────
router.get("/", optionalAuth, async (req, res) => {
  const { projectId, platform } = req.query;
  const where: Record<string, unknown> = {};
  if (projectId) where.projectId = String(projectId);
  if (platform) where.platform = String(platform);

  const snapshots = await db.analyticsSnapshot.findMany({
    where,
    orderBy: { capturedAt: "desc" },
    take: 200,
    include: { project: { select: { title: true } } },
  });
  res.json({ snapshots });
});

// ── Dashboard summary ─────────────────────────────────────────────────────────
router.get("/summary", optionalAuth, async (req, res) => {
  const userId = req.user?.userId;

  // Get project count
  const projectWhere = userId ? { userId } : {};
  const [totalProjects, succeededProjects, scheduledJobs, recentProjects] = await Promise.all([
    db.project.count({ where: projectWhere }),
    db.project.count({ where: { ...projectWhere, status: "SUCCEEDED" } }),
    db.publishJob.count({ where: { status: "SCHEDULED" } }),
    db.project.findMany({
      where: { ...projectWhere, status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { scenes: { select: { id: true } } },
    }),
  ]);

  // Aggregate analytics
  const analyticsAgg = await db.analyticsSnapshot.aggregate({
    _sum: { views: true, likes: true, comments: true, shares: true },
    _avg: { retention: true },
    where: projectWhere.userId
      ? { project: { userId: projectWhere.userId } }
      : {},
  });

  res.json({
    summary: {
      totalProjects,
      succeededProjects,
      scheduledJobs,
      totalViews: analyticsAgg._sum.views ?? 0,
      totalLikes: analyticsAgg._sum.likes ?? 0,
      avgRetention: Math.round((analyticsAgg._avg.retention ?? 0) * 10) / 10,
      recentProjects,
    },
  });
});

// ── Record analytics (webhook from publishing platforms) ──────────────────────
router.post("/", async (req, res) => {
  const { projectId, platform, views = 0, likes = 0, comments = 0, shares = 0, retention, watchTime, followers = 0 } = req.body;
  if (!projectId || !platform) return res.status(400).json({ error: "projectId and platform required" });

  const snap = await db.analyticsSnapshot.create({
    data: { projectId, platform, views, likes, comments, shares, retention, watchTime, followers },
  });
  res.status(201).json({ snapshot: snap });
});

export default router;
