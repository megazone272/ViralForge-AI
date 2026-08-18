/**
 * SystemStatusService
 * Checks all required components at startup and on demand.
 * Never exposes secrets in the response.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFfmpegPath, isFfmpegAvailable } from "./ffmpeg.js";
import { isPiperAvailable, listModels } from "./piper.js";
import { isWhisperAvailable } from "./whisper.js";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");

export interface SystemStatus {
  node: boolean;
  nodeVersion: string;
  ffmpeg: boolean;
  ffmpegPath: string | null;
  piper: boolean;
  piperPath: string | null;
  piperModels: string[];
  whisper: boolean;
  python: boolean;
  pythonVersion: string | null;
  database: boolean;
  huggingface: boolean;   // token present (never value)
  openai: boolean;        // key present (never value)
  storageDir: string;
  storageWritable: boolean;
  timestamp: string;
}

let _cached: SystemStatus | null = null;
let _cachedAt = 0;
const CACHE_TTL = 30_000; // 30 sec

export async function getSystemStatus(force = false): Promise<SystemStatus> {
  if (!force && _cached && Date.now() - _cachedAt < CACHE_TTL) return _cached;

  const status: SystemStatus = {
    node: true,
    nodeVersion: process.version,
    ffmpeg: false,
    ffmpegPath: null,
    piper: false,
    piperPath: null,
    piperModels: [],
    whisper: false,
    python: false,
    pythonVersion: null,
    database: false,
    huggingface: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN),
    openai: !!process.env.OPENAI_API_KEY,
    storageDir: path.resolve(process.env.STORAGE_DIR || path.join(PROJECT_ROOT, "storage")),
    storageWritable: false,
    timestamp: new Date().toISOString(),
  };

  // FFmpeg
  try {
    status.ffmpeg = await isFfmpegAvailable();
    if (status.ffmpeg) status.ffmpegPath = await getFfmpegPath();
  } catch {}

  // Piper
  try {
    status.piper = await isPiperAvailable();
    if (status.piper) {
      const PIPER_EXE = path.join(PROJECT_ROOT, "piper", "piper.exe");
      status.piperPath = existsSync(PIPER_EXE) ? PIPER_EXE : null;
      const models = await listModels();
      status.piperModels = models.map((m) => m.name);
    }
  } catch {}

  // Python + Whisper
  const pythonCandidates = ["python", "python3", "py"];
  for (const py of pythonCandidates) {
    try {
      const { stdout } = await execFileP(py, ["--version"], { timeout: 5000 });
      if (stdout.match(/Python \d/)) {
        status.python = true;
        status.pythonVersion = stdout.trim();
        break;
      }
    } catch {}
  }
  if (status.python) {
    try { status.whisper = await isWhisperAvailable(); } catch {}
  }

  // Database
  try {
    const dbUrl = process.env.DATABASE_URL || "";
    if (dbUrl) {
      const url = new URL(dbUrl);
      await new Promise<void>((resolve, reject) => {
        import("node:net").then(({ createConnection }) => {
          const sock = createConnection(parseInt(url.port || "5432"), url.hostname);
          sock.on("connect", () => { sock.destroy(); resolve(); });
          sock.on("error", reject);
          setTimeout(() => reject(new Error("timeout")), 3000);
        });
      });
      status.database = true;
    }
  } catch {}

  // Storage writable
  try {
    const { writeFile, unlink, mkdir } = await import("node:fs/promises");
    await mkdir(status.storageDir, { recursive: true });
    const testFile = path.join(status.storageDir, ".write-test");
    await writeFile(testFile, "ok");
    await unlink(testFile);
    status.storageWritable = true;
  } catch {}

  _cached = status;
  _cachedAt = Date.now();
  return status;
}

/** Log startup system status summary */
export async function logSystemStatus(): Promise<void> {
  const s = await getSystemStatus(true);
  const icon = (ok: boolean) => (ok ? "✔" : "✖");
  console.log("\n── ViralForge AI System Status ──");
  console.log(`  Node.js      ${icon(s.node)}  ${s.nodeVersion}`);
  console.log(`  FFmpeg       ${icon(s.ffmpeg)}  ${s.ffmpegPath ?? "not found"}`);
  console.log(`  Piper        ${icon(s.piper)}  ${s.piperPath ?? "not found"}`);
  console.log(`  Piper models ${icon(s.piperModels.length > 0)}  ${s.piperModels.join(", ") || "none"}`);
  console.log(`  Python       ${icon(s.python)}  ${s.pythonVersion ?? "not found"}`);
  console.log(`  Whisper      ${icon(s.whisper)}  ${s.whisper ? "available" : "unavailable"}`);
  console.log(`  Database     ${icon(s.database)}`);
  console.log(`  HuggingFace  ${icon(s.huggingface)}  ${s.huggingface ? "token set" : "no token"}`);
  console.log(`  Storage      ${icon(s.storageWritable)}  ${s.storageDir}`);
  console.log("─────────────────────────────────\n");
}
