/**
 * PiperTTSService
 * - Detects piper.exe from project directory (never assumes global install)
 * - Downloads voice model if missing (en_US-lessac-medium)
 * - Generates WAV audio from narration text
 * - Returns absolute file path
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");

// ─── Paths ────────────────────────────────────────────────────────────────────
const PIPER_EXE = path.join(PROJECT_ROOT, "piper", "piper.exe");
const MODELS_DIR = path.join(PROJECT_ROOT, "piper", "models");
const ESPEAK_DATA = path.join(PROJECT_ROOT, "piper", "espeak-ng-data");

export interface VoiceModel {
  name: string;
  language: string;
  onnxPath: string;
  jsonPath: string;
}

// Built-in known models (downloaded to piper/models/)
const KNOWN_MODELS: Array<{
  name: string;
  language: string;
  url: string;
  jsonUrl: string;
}> = [
  {
    name: "en_US-lessac-medium",
    language: "en",
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
    jsonUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
  },
  {
    name: "en_US-ryan-high",
    language: "en",
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx",
    jsonUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json",
  },
];

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const file = require("fs").createWriteStream(dest);
    function get(u: string) {
      proto.get(u, (res: any) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`HTTP ${res.statusCode} from ${u}`));
        }
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      }).on("error", (e: any) => { file.close(); reject(e); });
    }
    get(url);
  });
}

let _piperAvailable: boolean | null = null;

export async function isPiperAvailable(): Promise<boolean> {
  if (_piperAvailable !== null) return _piperAvailable;
  _piperAvailable = existsSync(PIPER_EXE);
  return _piperAvailable;
}

/** List all available local voice models */
export async function listModels(): Promise<VoiceModel[]> {
  try {
    await fs.mkdir(MODELS_DIR, { recursive: true });
    const files = await fs.readdir(MODELS_DIR);
    const onnxFiles = files.filter((f) => f.endsWith(".onnx") && !f.endsWith(".onnx.json"));
    return onnxFiles.map((f) => {
      const name = f.replace(".onnx", "");
      const lang = name.split("_")[0] + "_" + name.split("_")[1];
      return {
        name,
        language: lang,
        onnxPath: path.join(MODELS_DIR, f),
        jsonPath: path.join(MODELS_DIR, f + ".json"),
      };
    });
  } catch {
    return [];
  }
}

/** Ensure a voice model is downloaded. Returns the model paths. */
export async function ensureModel(modelName?: string): Promise<VoiceModel> {
  await fs.mkdir(MODELS_DIR, { recursive: true });

  // 1. Check what's already on disk
  const existing = await listModels();
  const target = modelName
    ? existing.find((m) => m.name === modelName)
    : existing[0];
  if (target && existsSync(target.onnxPath) && existsSync(target.jsonPath)) {
    return target;
  }

  // 2. Try to download the requested or default model
  const modelDef =
    KNOWN_MODELS.find((m) => m.name === (modelName || "en_US-lessac-medium")) ??
    KNOWN_MODELS[0];
  const onnxPath = path.join(MODELS_DIR, `${modelDef.name}.onnx`);
  const jsonPath = path.join(MODELS_DIR, `${modelDef.name}.onnx.json`);

  if (!existsSync(onnxPath)) {
    console.log(`[piper] Downloading voice model: ${modelDef.name}...`);
    await downloadFile(modelDef.url, onnxPath);
    console.log(`[piper] Model downloaded: ${onnxPath}`);
  }
  if (!existsSync(jsonPath)) {
    console.log(`[piper] Downloading model config...`);
    await downloadFile(modelDef.jsonUrl, jsonPath);
  }

  if (!existsSync(onnxPath) || !existsSync(jsonPath)) {
    throw new Error(`Piper voice model download failed: ${modelDef.name}`);
  }

  return { name: modelDef.name, language: modelDef.language, onnxPath, jsonPath };
}

export interface SpeechOpts {
  text: string;
  outputPath: string;
  modelName?: string;
  speed?: number; // 0.5–2.0, default 1.0
}

/**
 * Generate speech WAV from text using Piper.
 * Throws a descriptive error if piper is missing or model is missing.
 */
export async function generateSpeech(opts: SpeechOpts): Promise<string> {
  const { text, outputPath, modelName, speed = 1.0 } = opts;

  if (!existsSync(PIPER_EXE)) {
    throw new Error(
      `Piper TTS not found at ${PIPER_EXE}. Ensure the piper/ directory is intact.`
    );
  }

  const model = await ensureModel(modelName);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Ensure output is .wav (piper native format)
  const wavPath = outputPath.endsWith(".wav")
    ? outputPath
    : outputPath.replace(/\.[^.]+$/, ".wav");

  await new Promise<void>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // Tell piper where its espeak-ng-data lives
      PIPER_ESPEAK_DATA: ESPEAK_DATA,
    };

    const args = [
      "--model", model.onnxPath,
      "--config", model.jsonPath,
      "--output_file", wavPath,
      "--length_scale", String(1.0 / speed), // piper uses length_scale (inverse of speed)
    ];

    const piperProc = spawn(PIPER_EXE, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    piperProc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    piperProc.stdin.write(text.trim() + "\n");
    piperProc.stdin.end();

    const timeout = setTimeout(() => {
      piperProc.kill();
      reject(new Error(`Piper TTS timeout after 60s for text: "${text.slice(0, 50)}..."`));
    }, 60_000);

    piperProc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Piper exited ${code}: ${stderr.slice(0, 300)}`));
    });
    piperProc.on("error", (e) => { clearTimeout(timeout); reject(e); });
  });

  const stat = await fs.stat(wavPath).catch(() => null);
  if (!stat || stat.size < 100) {
    throw new Error(`Piper produced empty WAV for: "${text.slice(0, 50)}"`);
  }

  console.log(`[piper] Generated ${Math.round(stat.size / 1024)}KB: ${path.basename(wavPath)}`);
  return wavPath;
}

/** Convert WAV to MP3 using ffmpeg (for smaller file sizes) */
export async function wavToMp3(wavPath: string, ffmpegPath: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);
  const mp3Path = wavPath.replace(/\.wav$/, ".mp3");
  await exec(ffmpegPath, ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "128k", mp3Path]);
  await fs.unlink(wavPath).catch(() => {});
  return mp3Path;
}
