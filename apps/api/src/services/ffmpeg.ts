/**
 * VideoRendererService
 * - Detects ffmpeg: system PATH → bin/ffmpeg.exe → error
 * - Combines images + audio + subtitles into final MP4
 * - Outputs: 1080x1920 (vertical), 1920x1080 (landscape), 1080x1350, 1080x1080
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");

export type OutputFormat = "vertical" | "landscape" | "square" | "reels";

const FORMAT_DIMS: Record<OutputFormat, [number, number]> = {
  vertical:  [1080, 1920],
  landscape: [1920, 1080],
  reels:     [1080, 1350],
  square:    [1080, 1080],
};

let _ffmpegPath: string | null = null;

/** Resolve ffmpeg binary: system PATH → bin/ffmpeg.exe */
export async function getFfmpegPath(): Promise<string> {
  if (_ffmpegPath) return _ffmpegPath;

  const candidates = [
    process.env.FFMPEG_PATH,                              // explicit env override
    path.join(PROJECT_ROOT, "bin", "ffmpeg.exe"),         // local downloaded binary
    "ffmpeg",                                             // system PATH
    "ffmpeg.exe",                                         // system PATH (windows)
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileP(candidate, ["-version"], { timeout: 5000 });
      if (stdout.includes("ffmpeg version")) {
        _ffmpegPath = candidate;
        console.log(`[ffmpeg] Using: ${candidate}`);
        return candidate;
      }
    } catch {}
  }
  throw new Error(
    "FFmpeg not found. Run: node scripts/setup.mjs  OR  install FFmpeg from https://www.gyan.dev/ffmpeg/builds/"
  );
}

/** Check if ffmpeg is available (no throw) */
export async function isFfmpegAvailable(): Promise<boolean> {
  try { await getFfmpegPath(); return true; } catch { return false; }
}

export interface RenderOptions {
  images: string[];           // one image per scene (must exist)
  audioPaths?: string[];      // one audio file per scene (optional)
  audioMix?: string;          // single narration track (alternative)
  bgMusicPath?: string;       // optional background music
  srtPath?: string;           // optional subtitle file
  outputPath: string;
  fps?: number;               // default 30
  format?: OutputFormat;      // default "vertical"
  sceneDurations?: number[];  // seconds per scene (default 5)
}

export interface RenderResult {
  outputPath: string;
  durationSec: number;
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const ffmpeg = await getFfmpegPath();
  const {
    images,
    audioPaths = [],
    audioMix,
    bgMusicPath,
    srtPath,
    outputPath,
    fps = 30,
    format = "vertical",
    sceneDurations,
  } = opts;

  if (!images.length) throw new Error("renderVideo: no images provided");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const [W, H] = FORMAT_DIMS[format];
  const durations = sceneDurations?.length === images.length
    ? sceneDurations
    : images.map(() => 5);
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  // ── Build concat list file ────────────────────────────────────────────
  // Each image shown for its scene duration — use concat demuxer
  const concatLines: string[] = [];
  for (let i = 0; i < images.length; i++) {
    if (!existsSync(images[i])) throw new Error(`Image not found: ${images[i]}`);
    concatLines.push(`file '${images[i].replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
    concatLines.push(`duration ${durations[i]}`);
  }
  // Add last image again (concat demuxer requirement)
  concatLines.push(`file '${images[images.length - 1].replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);

  const concatFile = outputPath + ".concat.txt";
  await fs.writeFile(concatFile, concatLines.join("\n"));

  // ── Merge per-scene audio files into single track ─────────────────────
  let finalAudioPath: string | null = null;
  if (audioMix && existsSync(audioMix)) {
    finalAudioPath = audioMix;
  } else if (audioPaths.length > 0) {
    const existingAudio = audioPaths.filter((p) => p && existsSync(p));
    if (existingAudio.length > 0) {
      const mergedAudio = outputPath + ".merged.mp3";
      if (existingAudio.length === 1) {
        finalAudioPath = existingAudio[0];
      } else {
        // Concat audio files using ffmpeg
        const audioConcat = outputPath + ".audio-concat.txt";
        await fs.writeFile(
          audioConcat,
          existingAudio.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n")
        );
        await execFileP(ffmpeg, [
          "-y", "-f", "concat", "-safe", "0", "-i", audioConcat,
          "-c:a", "aac", "-b:a", "128k", mergedAudio,
        ]);
        await fs.unlink(audioConcat).catch(() => {});
        finalAudioPath = mergedAudio;
      }
    }
  }

  // ── Build FFmpeg args ─────────────────────────────────────────────────
  const args: string[] = ["-y"];

  // Video input: images via concat demuxer
  args.push("-f", "concat", "-safe", "0", "-i", concatFile);

  // Audio input
  if (finalAudioPath) {
    args.push("-i", finalAudioPath);
  }
  if (bgMusicPath && existsSync(bgMusicPath)) {
    args.push("-i", bgMusicPath);
  }

  // Video filter: scale + crop to target dimensions + zoom/pan
  const vfBase = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p`;

  // Subtitle filter (if srt available)
  const vfFull = srtPath && existsSync(srtPath)
    ? `${vfBase},subtitles='${srtPath.replace(/\\/g, "/").replace(/'/g, "'\\''")}':force_style='FontSize=18,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=30'`
    : vfBase;

  args.push("-vf", vfFull);
  args.push("-r", String(fps));

  // Audio mixing
  const hasAudio = !!finalAudioPath;
  const hasBg = !!(bgMusicPath && existsSync(bgMusicPath));

  if (hasAudio && hasBg) {
    // Mix narration + background music (bg at -18dB)
    args.push("-filter_complex", "[1:a]volume=1.0[narr];[2:a]volume=0.1[bg];[narr][bg]amix=inputs=2:duration=first[a]", "-map", "0:v", "-map", "[a]");
  } else if (hasAudio) {
    args.push("-map", "0:v", "-map", "1:a");
  } else {
    args.push("-map", "0:v", "-an");
  }

  args.push("-c:v", "libx264", "-preset", "fast", "-crf", "22");
  if (hasAudio) args.push("-c:a", "aac", "-b:a", "128k", "-shortest");
  args.push("-movflags", "+faststart");
  args.push("-t", String(totalDuration));
  args.push(outputPath);

  try {
    await execFileP(ffmpeg, args, { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 });
  } catch (e: any) {
    throw new Error(`FFmpeg render failed: ${e.stderr || e.message}`);
  }

  // Cleanup temp files
  await fs.unlink(concatFile).catch(() => {});
  if (finalAudioPath && finalAudioPath.endsWith(".merged.mp3"))
    await fs.unlink(finalAudioPath).catch(() => {});

  // Verify output
  const stat = await fs.stat(outputPath).catch(() => null);
  if (!stat || stat.size < 1000) throw new Error("FFmpeg produced empty/missing output file");

  return { outputPath, durationSec: totalDuration };
}

/** Get video duration in seconds via ffprobe */
export async function getVideoDuration(videoPath: string): Promise<number> {
  const ffmpeg = await getFfmpegPath();
  const ffprobe = ffmpeg.replace("ffmpeg", "ffprobe");
  try {
    const { stdout } = await execFileP(ffprobe, [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", videoPath,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}
