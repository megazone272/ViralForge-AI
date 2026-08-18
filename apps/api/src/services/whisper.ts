/**
 * WhisperService
 * - Uses Python openai-whisper CLI for real subtitle generation
 * - Generates .srt and .vtt from audio files
 * - NO silent fallback to timing-only subtitles
 * - If whisper is unavailable, throws a clear error (reported in System Status)
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");

export interface WhisperResult {
  srtPath: string;
  vttPath: string;
  segments: WhisperSegment[];
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

type WhisperModelSize = "tiny" | "base" | "small" | "medium" | "large";

let _pythonPath: string | null = null;
let _whisperAvailable: boolean | null = null;

/** Find a working Python executable */
async function findPython(): Promise<string | null> {
  if (_pythonPath !== null) return _pythonPath;
  const candidates = ["python", "python3", "py"];
  for (const py of candidates) {
    try {
      const { stdout } = await execFileP(py, ["--version"], { timeout: 5000 });
      if (stdout.includes("Python") || stdout.includes("python")) {
        _pythonPath = py;
        return py;
      }
    } catch {}
    // try stderr (some pythons print version to stderr)
    try {
      await execFileP(py, ["-c", "import sys; print(sys.version)"], { timeout: 5000 });
      _pythonPath = py;
      return py;
    } catch {}
  }
  _pythonPath = null;
  return null;
}

/** Check if openai-whisper is installed and importable */
export async function isWhisperAvailable(): Promise<boolean> {
  if (_whisperAvailable !== null) return _whisperAvailable;
  const py = await findPython();
  if (!py) { _whisperAvailable = false; return false; }
  try {
    await execFileP(py, ["-c", "import whisper; print(whisper.__version__)"], { timeout: 10000 });
    _whisperAvailable = true;
    return true;
  } catch {}
  // Try CLI
  try {
    await execFileP(py, ["-m", "whisper", "--help"], { timeout: 10000 });
    _whisperAvailable = true;
    return true;
  } catch {}
  _whisperAvailable = false;
  return false;
}

/**
 * Generate SRT + VTT subtitles from an audio file using Whisper.
 * Throws a clear error if Whisper is unavailable — never silently produces fake subtitles.
 */
export async function generateSubtitles(
  audioPath: string,
  outputDir: string,
  opts: {
    model?: WhisperModelSize;
    language?: string;
    maxLineLen?: number;
  } = {}
): Promise<WhisperResult> {
  const { model = "base", language, maxLineLen = 42 } = opts;

  // ── Gate: verify whisper is installed ─────────────────────────────────
  const available = await isWhisperAvailable();
  if (!available) {
    const py = await findPython();
    if (!py) {
      throw new Error(
        "Whisper is unavailable: Python not found.\n" +
        "Install Python 3.9+ from https://python.org, then run: pip install openai-whisper"
      );
    }
    throw new Error(
      "Whisper is unavailable: openai-whisper not installed.\n" +
      "Run: pip install openai-whisper\n" +
      "Or: node scripts/setup.mjs"
    );
  }

  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found for transcription: ${audioPath}`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const py = await findPython() as string;

  // ── Run Whisper ────────────────────────────────────────────────────────
  // whisper <audio> --model <size> --output_dir <dir> --output_format all --language <lang>
  const args = [
    "-m", "whisper",
    audioPath,
    "--model", model,
    "--output_dir", outputDir,
    "--output_format", "all",   // generates .srt, .vtt, .txt, .json
    "--word_timestamps", "True",
    "--fp16", "False",           // CPU safe
  ];
  if (language) args.push("--language", language);

  console.log(`[whisper] Transcribing ${path.basename(audioPath)} (model: ${model})...`);
  try {
    await execFileP(py, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300_000, // 5 min timeout
      env: { ...process.env },
    });
  } catch (e: any) {
    throw new Error(
      `Whisper transcription failed for ${path.basename(audioPath)}: ${(e.stderr || e.message || "").slice(0, 300)}`
    );
  }

  // ── Locate output files ────────────────────────────────────────────────
  const basename = path.basename(audioPath, path.extname(audioPath));
  const srtOut = path.join(outputDir, `${basename}.srt`);
  const vttOut = path.join(outputDir, `${basename}.vtt`);

  if (!existsSync(srtOut)) {
    throw new Error(`Whisper ran but .srt not found at ${srtOut}`);
  }

  // ── Post-process: split long lines ────────────────────────────────────
  const srtRaw = await fs.readFile(srtOut, "utf-8");
  const srtProcessed = splitLongLines(srtRaw, maxLineLen);
  await fs.writeFile(srtOut, srtProcessed);

  // Parse segments for metadata
  const segments = parseSrt(srtProcessed);

  // Generate VTT if not produced
  if (!existsSync(vttOut)) {
    await fs.writeFile(vttOut, srtToVtt(srtProcessed));
  }

  console.log(`[whisper] Generated ${segments.length} subtitle segments`);
  return { srtPath: srtOut, vttPath: vttOut, segments };
}

/** Generate SRT from scene narrations + durations (only when whisper unavailable and audio missing) */
export async function generateSubtitlesFromText(
  narrations: string[],
  durations: number[],
  outputDir: string
): Promise<WhisperResult> {
  await fs.mkdir(outputDir, { recursive: true });
  const segments: WhisperSegment[] = [];
  let t = 0;
  for (let i = 0; i < narrations.length; i++) {
    const dur = durations[i] ?? 5;
    // Split narration into ~3-word chunks with even timing
    const words = narrations[i].trim().split(/\s+/);
    const chunkSize = 8;
    const chunks: string[] = [];
    for (let j = 0; j < words.length; j += chunkSize) {
      chunks.push(words.slice(j, j + chunkSize).join(" "));
    }
    const chunkDur = dur / Math.max(chunks.length, 1);
    for (const chunk of chunks) {
      segments.push({ start: t, end: t + chunkDur, text: chunk });
      t += chunkDur;
    }
  }

  const srtContent = segments
    .map((s, i) => `${i + 1}\n${formatTime(s.start)} --> ${formatTime(s.end)}\n${s.text}`)
    .join("\n\n");

  const srtPath = path.join(outputDir, "subtitles.srt");
  const vttPath = path.join(outputDir, "subtitles.vtt");
  await fs.writeFile(srtPath, srtContent);
  await fs.writeFile(vttPath, srtToVtt(srtContent));

  return { srtPath, vttPath, segments };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, "0")}`;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function splitLongLines(srt: string, maxLen: number): string {
  return srt.replace(/^(?!\d+$)(?![\d:]+--)(.+)$/gm, (line) => {
    if (line.length <= maxLen) return line;
    const words = line.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > maxLen) {
        if (current) lines.push(current.trim());
        current = word;
      } else {
        current = (current + " " + word).trim();
      }
    }
    if (current) lines.push(current.trim());
    return lines.join("\n");
  });
}

function parseSrt(srt: string): WhisperSegment[] {
  const blocks = srt.trim().split(/\n\n+/);
  const segments: WhisperSegment[] = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d+:\d+:\d+[,\.]\d+)\s*-->\s*(\d+:\d+:\d+[,\.]\d+)/);
    if (!timeMatch) continue;
    segments.push({
      start: parseTime(timeMatch[1]),
      end: parseTime(timeMatch[2]),
      text: lines.slice(2).join(" "),
    });
  }
  return segments;
}

function parseTime(ts: string): number {
  const [hms, ms] = ts.replace(",", ".").split(".");
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s + parseFloat("0." + (ms ?? "0"));
}

function srtToVtt(srt: string): string {
  return "WEBVTT\n\n" + srt.replace(/(\d+:\d+:\d+),(\d+)/g, "$1.$2");
}
