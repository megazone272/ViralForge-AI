import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { queue } from "./services/queue.js";
import { logSystemStatus } from "./services/system.js";

// Routes
import authRouter from "./routes/auth.js";
import projectsRouter from "./routes/projects.js";
import publishRouter from "./routes/publish.js";
import analyticsRouter from "./routes/analytics.js";
import ideasRouter from "./routes/ideas.js";
import systemRouter from "./routes/system.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(PROJECT_ROOT, "storage"));

// ── Security headers (relaxed for local dev, tighten for production) ──────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // frontend handles its own CSP
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (process.env.WEB_ORIGIN || "http://localhost:5173").split(","),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Rate limiting (generous for local dev) ────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true });
const heavyLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: "Too many generation requests — please wait" },
});

app.use(globalLimiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Static media serving ──────────────────────────────────────────────────────
app.use(
  "/media",
  express.static(STORAGE_DIR, {
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      // Allow video streaming with range requests
      if (filePath.endsWith(".mp4")) {
        res.setHeader("Accept-Ranges", "bytes");
      }
    },
  })
);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "viralforge-api", ts: new Date().toISOString() })
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/projects", heavyLimiter); // rate-limit generation
app.use("/api/projects", projectsRouter);
app.use("/api/publish", publishRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/ideas", ideasRouter);
app.use("/api/system", systemRouter);

// Legacy accounts stub
app.get("/api/accounts", (_req, res) => res.json({ accounts: [] }));

// ── OAuth stubs (placeholders until credentials are provided) ──────────────────
app.get("/auth/:platform/connect", (req, res) => {
  const { platform } = req.params;
  const creds: Record<string, string | undefined> = {
    youtube: process.env.YOUTUBE_CLIENT_ID,
    tiktok: process.env.TIKTOK_CLIENT_KEY,
    meta: process.env.META_APP_ID,
  };
  if (!creds[platform.toLowerCase()]) {
    return res.status(503).json({
      error: `${platform} OAuth not configured`,
      message: `Set ${platform.toUpperCase()}_CLIENT_ID (or equivalent) in .env to enable ${platform} publishing`,
    });
  }
  res.json({ message: `OAuth flow for ${platform} — implement redirect here` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err.message);
  // Never expose stack traces or secrets in response
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  // Log system status on startup
  await logSystemStatus().catch((e) => console.warn("System status check failed:", e.message));

  // Register publish job handler
  queue.register("publish-video", async (job) => {
    const { publishJobId } = job.data as { publishJobId: string };
    const pJob = await db.publishJob.findUnique({
      where: { id: publishJobId },
      include: { project: true },
    });
    if (!pJob) throw new Error(`PublishJob not found: ${publishJobId}`);
    if (!pJob.project.videoPath) throw new Error("Video not yet rendered");

    await db.publishJob.update({ where: { id: publishJobId }, data: { status: "PROCESSING", attempts: { increment: 1 } } });

    // Check for OAuth token
    const account = pJob.accountId
      ? await db.socialAccount.findUnique({ where: { id: pJob.accountId } })
      : null;

    if (!account) {
      await db.publishJob.update({
        where: { id: publishJobId },
        data: {
          status: "FAILED",
          error: `No OAuth account connected for ${pJob.platform}. Connect your account in the Accounts section.`,
        },
      });
      return;
    }

    // Platform adapter
    const { publishers } = await import("./publishers.js");
    const publisher = publishers[pJob.platform];
    if (!publisher) throw new Error(`No publisher for platform: ${pJob.platform}`);

    try {
      const result = await publisher.publish({
        videoPath: pJob.project.videoPath,
        title: pJob.title ?? pJob.project.title,
        caption: pJob.caption ?? "",
        accessToken: account.accessToken,
      });
      await db.publishJob.update({
        where: { id: publishJobId },
        data: { status: "PUBLISHED", remoteId: result.remoteId },
      });
    } catch (e: any) {
      await db.publishJob.update({
        where: { id: publishJobId },
        data: { status: "FAILED", error: e.message },
      });
      throw e;
    }
  });

  // Start scheduled job processor
  queue.startScheduler(15_000);

  app.listen(PORT, () => {
    console.log(`\n🚀 ViralForge API → http://localhost:${PORT}`);
    console.log(`   Storage: ${STORAGE_DIR}`);
    console.log(`   Env: ${process.env.NODE_ENV || "development"}\n`);
  });
}

start().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});