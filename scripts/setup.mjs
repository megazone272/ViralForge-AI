#!/usr/bin/env node
/**
 * ViralForge AI — Setup Script
 * Detects system components, downloads missing binaries/models, verifies each one.
 * Run: node scripts/setup.mjs
 */
import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { fileURLToPath } from "node:url";
import os from "node:os";

const execFileP = promisify(execFile);
const execP = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const COLORS = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function ok(msg) { console.log(COLORS.green("  ✔ " + msg)); }
function warn(msg) { console.log(COLORS.yellow("  ⚠ " + msg)); }
function fail(msg) { console.log(COLORS.red("  ✖ " + msg)); }
function info(msg) { console.log(COLORS.cyan("  → " + msg)); }
function section(msg) { console.log("\n" + COLORS.bold(COLORS.cyan("══ " + msg + " ══"))); }

// ─── Download helper ──────────────────────────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const file = createWriteStream(dest);
    function get(u) {
      proto.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const total = parseInt(res.headers["content-length"] || "0");
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\r  → Downloading... ${pct}%`);
          }
        });
        res.pipe(file);
        file.on("finish", () => { file.close(); process.stdout.write("\n"); resolve(); });
      }).on("error", reject);
    }
    get(url);
  });
}

// ─── Unzip helper (PowerShell on Windows) ─────────────────────────────────────
async function unzip(zipPath, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  if (os.platform() === "win32") {
    await execP(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`
    );
  } else {
    await execP(`unzip -o "${zipPath}" -d "${destDir}"`);
  }
}

const STATUS = {
  node: false,
  ffmpeg: false,
  ffmpegPath: null,
  piper: false,
  piperPath: null,
  piperModel: false,
  piperModelPath: null,
  whisper: false,
  whisperPath: null,
  python: false,
  pythonPath: null,
  database: false,
  huggingface: false,
};

// ─── 1. Node ──────────────────────────────────────────────────────────────────
section("Node.js");
try {
  const { stdout } = await execFileP(process.execPath, ["--version"]);
  STATUS.node = true;
  ok(`Node.js ${stdout.trim()}`);
} catch {
  fail("Node.js not detected (you're running this, so something is very wrong)");
}

// ─── 2. FFmpeg ────────────────────────────────────────────────────────────────
section("FFmpeg");
const BIN_DIR = path.join(ROOT, "bin");
await fs.mkdir(BIN_DIR, { recursive: true });
const LOCAL_FFMPEG = path.join(BIN_DIR, "ffmpeg.exe");

async function testFfmpeg(ffmpegBin) {
  try {
    const { stdout } = await execFileP(ffmpegBin, ["-version"]);
    return stdout.includes("ffmpeg version");
  } catch {
    return false;
  }
}

// Try system ffmpeg first
let foundFfmpeg = false;
const systemFfmpegNames = ["ffmpeg", "ffmpeg.exe"];
for (const name of systemFfmpegNames) {
  try {
    if (await testFfmpeg(name)) {
      STATUS.ffmpeg = true;
      STATUS.ffmpegPath = name;
      ok(`System ffmpeg found: ${name}`);
      foundFfmpeg = true;
      break;
    }
  } catch {}
}

// Try local bin/ffmpeg.exe
if (!foundFfmpeg && existsSync(LOCAL_FFMPEG)) {
  if (await testFfmpeg(LOCAL_FFMPEG)) {
    STATUS.ffmpeg = true;
    STATUS.ffmpegPath = LOCAL_FFMPEG;
    ok(`Local ffmpeg found: ${LOCAL_FFMPEG}`);
    foundFfmpeg = true;
  }
}

// Download prebuilt Windows ffmpeg
if (!foundFfmpeg && os.platform() === "win32") {
  info("Downloading prebuilt FFmpeg for Windows...");
  const FFMPEG_ZIP = path.join(BIN_DIR, "ffmpeg-win.zip");
  // Use BtbN's builds — reliable, minimal GPL build
  const FFMPEG_URL =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip";
  try {
    await download(FFMPEG_URL, FFMPEG_ZIP);
    const EXTRACT_DIR = path.join(BIN_DIR, "ffmpeg-extract");
    await unzip(FFMPEG_ZIP, EXTRACT_DIR);
    // Find ffmpeg.exe recursively
    async function findFile(dir, name) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { const r = await findFile(full, name); if (r) return r; }
        else if (e.name === name) return full;
      }
      return null;
    }
    const src = await findFile(EXTRACT_DIR, "ffmpeg.exe");
    if (src) {
      await fs.copyFile(src, LOCAL_FFMPEG);
      // Copy required DLLs to bin/
      const srcDir = path.dirname(src);
      const dlls = (await fs.readdir(srcDir)).filter((f) => f.endsWith(".dll"));
      for (const dll of dlls) await fs.copyFile(path.join(srcDir, dll), path.join(BIN_DIR, dll)).catch(() => {});
      if (await testFfmpeg(LOCAL_FFMPEG)) {
        STATUS.ffmpeg = true;
        STATUS.ffmpegPath = LOCAL_FFMPEG;
        ok(`FFmpeg downloaded and verified: ${LOCAL_FFMPEG}`);
      } else {
        fail("Downloaded FFmpeg failed verification");
      }
    }
    await fs.rm(FFMPEG_ZIP, { force: true });
    await fs.rm(EXTRACT_DIR, { recursive: true, force: true });
  } catch (e) {
    fail(`FFmpeg download failed: ${e.message}`);
    warn("Install FFmpeg manually: https://www.gyan.dev/ffmpeg/builds/");
  }
}

if (!STATUS.ffmpeg) fail("FFmpeg not available — video rendering disabled");

// ─── 3. Piper TTS ─────────────────────────────────────────────────────────────
section("Piper TTS");
const PIPER_EXE = path.join(ROOT, "piper", "piper.exe");
const PIPER_MODELS_DIR = path.join(ROOT, "piper", "models");
const PIPER_MODEL_NAME = "en_US-lessac-medium";
const PIPER_MODEL_FILE = path.join(PIPER_MODELS_DIR, `${PIPER_MODEL_NAME}.onnx`);
const PIPER_MODEL_JSON = path.join(PIPER_MODELS_DIR, `${PIPER_MODEL_NAME}.onnx.json`);

await fs.mkdir(PIPER_MODELS_DIR, { recursive: true });

if (existsSync(PIPER_EXE)) {
  STATUS.piper = true;
  STATUS.piperPath = PIPER_EXE;
  ok(`piper.exe found: ${PIPER_EXE}`);
} else {
  fail(`piper.exe not found at ${PIPER_EXE}`);
}

// Download model if missing
if (STATUS.piper && !existsSync(PIPER_MODEL_FILE)) {
  info(`Downloading Piper voice model: ${PIPER_MODEL_NAME}...`);
  const BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium";
  try {
    await download(`${BASE}/${PIPER_MODEL_NAME}.onnx`, PIPER_MODEL_FILE);
    await download(`${BASE}/${PIPER_MODEL_NAME}.onnx.json`, PIPER_MODEL_JSON);
    ok("Piper voice model downloaded");
  } catch (e) {
    fail(`Piper model download failed: ${e.message}`);
  }
}

if (existsSync(PIPER_MODEL_FILE) && existsSync(PIPER_MODEL_JSON)) {
  STATUS.piperModel = true;
  STATUS.piperModelPath = PIPER_MODEL_FILE;
  ok(`Piper model ready: ${PIPER_MODEL_FILE}`);
} else {
  warn("Piper model missing — TTS will be unavailable");
}

// Verify Piper with a real test
if (STATUS.piper && STATUS.piperModel) {
  const testWav = path.join(PIPER_MODELS_DIR, "test.wav");
  try {
    await new Promise((resolve, reject) => {
      const child = require ? null : null; // ESM workaround
      import("node:child_process").then(({ spawn }) => {
        const piperProc = spawn(
          PIPER_EXE,
          ["--model", PIPER_MODEL_FILE, "--output_file", testWav],
          { env: { ...process.env, PIPER_ESPEAK_DATA: path.join(ROOT, "piper", "espeak-ng-data") } }
        );
        piperProc.stdin.write("ViralForge AI is ready.\n");
        piperProc.stdin.end();
        piperProc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`piper exit code ${code}`));
        });
        piperProc.on("error", reject);
        setTimeout(() => reject(new Error("Piper timeout")), 30000);
      });
    });
    const stat = await fs.stat(testWav).catch(() => null);
    if (stat && stat.size > 0) {
      ok(`Piper TTS verified — test.wav ${Math.round(stat.size / 1024)}KB`);
      await fs.unlink(testWav).catch(() => {});
    } else {
      fail("Piper produced empty output");
    }
  } catch (e) {
    warn(`Piper verification warning: ${e.message}`);
  }
}

// ─── 4. Python / Whisper ──────────────────────────────────────────────────────
section("Python / Whisper");
const pythonCandidates = ["python", "python3", "py"];
for (const py of pythonCandidates) {
  try {
    const { stdout } = await execP(`${py} --version`);
    if (stdout.includes("Python")) {
      STATUS.python = true;
      STATUS.pythonPath = py;
      ok(`Python found: ${py} — ${stdout.trim()}`);
      break;
    }
  } catch {}
}

if (!STATUS.python) {
  fail("Python not found — Whisper subtitle generation unavailable");
  warn("Install Python 3.9+ from https://python.org");
} else {
  // Check whisper
  try {
    const { stdout } = await execP(`${STATUS.pythonPath} -m whisper --help`);
    if (stdout.includes("usage") || stdout.includes("whisper")) {
      STATUS.whisper = true;
      STATUS.whisperPath = STATUS.pythonPath;
      ok("Whisper (openai-whisper) available");
    }
  } catch {
    // Try installing from whisper-20250625 if available
    const whisperSrc = path.join(ROOT, "whisper-20250625");
    if (existsSync(whisperSrc)) {
      info("Installing Whisper from local source...");
      try {
        await execP(`${STATUS.pythonPath} -m pip install -e "${whisperSrc}" --quiet`);
        const { stdout } = await execP(`${STATUS.pythonPath} -m whisper --help`);
        if (stdout.includes("usage") || stdout.includes("whisper")) {
          STATUS.whisper = true;
          STATUS.whisperPath = STATUS.pythonPath;
          ok("Whisper installed from local source and verified");
        }
      } catch (e) {
        warn(`Whisper install failed: ${e.message}`);
        info("Try manually: pip install openai-whisper");
      }
    } else {
      info("Installing openai-whisper from pip...");
      try {
        await execP(`${STATUS.pythonPath} -m pip install openai-whisper --quiet`);
        const { stdout } = await execP(`${STATUS.pythonPath} -m whisper --help`);
        if (stdout.includes("usage") || stdout.includes("whisper")) {
          STATUS.whisper = true;
          STATUS.whisperPath = STATUS.pythonPath;
          ok("Whisper installed and verified");
        }
      } catch (e) {
        warn(`Whisper install failed: ${e.message}`);
      }
    }
  }
  if (!STATUS.whisper) fail("Whisper unavailable — subtitle generation will report missing in System Status");
}

// ─── 5. HuggingFace ───────────────────────────────────────────────────────────
section("HuggingFace");
const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "";
if (hfToken) {
  STATUS.huggingface = true;
  ok("HF_TOKEN configured");
  // Test text model
  const textModel = process.env.HF_TEXT_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";
  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${textModel}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${hfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "Hello", parameters: { max_new_tokens: 5 } }),
      }
    );
    if (res.ok || res.status === 503) {
      ok(`HF text model reachable: ${textModel} (${res.status === 503 ? "loading" : "ready"})`);
    } else {
      warn(`HF text model responded: HTTP ${res.status}`);
    }
  } catch (e) {
    warn(`HF text model test failed: ${e.message}`);
  }
} else {
  warn("HF_TOKEN not set — AI generation will use local fallback (mock scripts)");
  info("Set HF_TOKEN=your_token in .env to enable real AI generation");
}

// ─── 6. Database ──────────────────────────────────────────────────────────────
section("Database");
const dbUrl = process.env.DATABASE_URL || "";
if (dbUrl) {
  try {
    const url = new URL(dbUrl);
    info(`Checking PostgreSQL at ${url.host}...`);
    // Try TCP connect
    await new Promise((resolve, reject) => {
      import("node:net").then(({ createConnection }) => {
        const sock = createConnection(parseInt(url.port || "5432"), url.hostname);
        sock.on("connect", () => { sock.destroy(); resolve(); });
        sock.on("error", reject);
        setTimeout(() => reject(new Error("timeout")), 3000);
      });
    });
    STATUS.database = true;
    ok("PostgreSQL reachable");
  } catch {
    warn("PostgreSQL not reachable — run: docker compose up -d");
  }
} else {
  warn("DATABASE_URL not set");
}

// ─── Write status file ────────────────────────────────────────────────────────
section("Summary");
const statusFile = path.join(ROOT, "apps", "api", "src", ".system-status.json");
await fs.writeFile(statusFile, JSON.stringify(STATUS, null, 2));

const allOk = [STATUS.node, STATUS.ffmpeg, STATUS.piper, STATUS.piperModel];
console.log("\n" + COLORS.bold("Component Status:"));
console.log(`  Node.js      : ${STATUS.node ? COLORS.green("✔") : COLORS.red("✖")}`);
console.log(`  FFmpeg       : ${STATUS.ffmpeg ? COLORS.green("✔ " + STATUS.ffmpegPath) : COLORS.red("✖ missing")}`);
console.log(`  Piper exe    : ${STATUS.piper ? COLORS.green("✔") : COLORS.red("✖ missing")}`);
console.log(`  Piper model  : ${STATUS.piperModel ? COLORS.green("✔ " + PIPER_MODEL_NAME) : COLORS.red("✖ missing")}`);
console.log(`  Python       : ${STATUS.python ? COLORS.green("✔ " + STATUS.pythonPath) : COLORS.yellow("⚠ missing")}`);
console.log(`  Whisper      : ${STATUS.whisper ? COLORS.green("✔") : COLORS.red("✖ unavailable")}`);
console.log(`  HuggingFace  : ${STATUS.huggingface ? COLORS.green("✔ token set") : COLORS.yellow("⚠ no token")}`);
console.log(`  PostgreSQL   : ${STATUS.database ? COLORS.green("✔") : COLORS.yellow("⚠ not reachable")}`);

console.log(`\n  Status written to: ${statusFile}`);
if (!STATUS.ffmpeg) console.log(COLORS.red("\n  ⚠ Critical: FFmpeg missing — install from https://www.gyan.dev/ffmpeg/builds/"));
if (!STATUS.whisper) console.log(COLORS.yellow("\n  ⚠ Whisper missing — subtitles unavailable. Run: pip install openai-whisper"));
