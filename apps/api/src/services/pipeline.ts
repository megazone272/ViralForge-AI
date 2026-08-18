/**
 * Video Generation Pipeline
 * Orchestrates: AI Script → Images → Piper TTS → Whisper Subtitles → FFmpeg render
 */
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db } from "../db.js";
import { planVideo, generateImage } from "../ai.js";
import { generateSpeech, ensureModel, isPiperAvailable } from "./piper.js";
import { generateSubtitles, isWhisperAvailable, generateSubtitlesFromText } from "./whisper.js";
import { renderVideo, getFfmpegPath } from "./ffmpeg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");

export interface PipelineOpts {
  projectId: string;
  userId: string;
}

export interface PipelineResult {
  projectId: string;
  videoPath: string;
  srtPath: string | null;
  scenesGenerated: number;
  hasAudio: boolean;
  hasSubtitles: boolean;
}

export async function runPipeline(opts: PipelineOpts): Promise<PipelineResult> {
  const { projectId } = opts;
  const storageRoot = path.resolve(process.env.STORAGE_DIR || path.join(PROJECT_ROOT, "storage"));
  const projectDir = path.join(storageRoot, "projects", projectId);

  const sceneDir = (n: number) => path.join(projectDir, "scenes", `scene-${String(n).padStart(3, "0")}`);
  const audioDir = path.join(projectDir, "audio");
  const captionsDir = path.join(projectDir, "captions");
  const finalDir = path.join(projectDir, "final");

  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(captionsDir, { recursive: true });
  await fs.mkdir(finalDir, { recursive: true });

  // ── Fetch project ────────────────────────────────────────────────────────
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project not found: ${projectId}`);

  await db.project.update({ where: { id: projectId }, data: { status: "RUNNING", errorMsg: null } });

  try {
    // ── Step 1: Generate script ──────────────────────────────────────────
    console.log(`[pipeline:${projectId}] Step 1/5: Generating script...`);
    const plan = await planVideo(
      project.prompt,
      project.language,
      project.durationSec,
      project.style,
      project.platform,
      project.tone
    );

    await db.project.update({
      where: { id: projectId },
      data: { script: JSON.stringify(plan), title: plan.title.slice(0, 70) },
    });

    // ── Step 2: Generate scenes (images + audio) ─────────────────────────
    console.log(`[pipeline:${projectId}] Step 2/5: Generating ${plan.scenes.length} scenes...`);

    const piperAvail = await isPiperAvailable();
    let piperModel = null;
    if (piperAvail) {
      try { piperModel = await ensureModel(); } catch (e: any) {
        console.warn(`[pipeline] Piper model unavailable: ${e.message}`);
      }
    }

    const ffmpegPath = await getFfmpegPath();
    const sceneRecords: any[] = [];
    const imagePaths: string[] = [];
    const audioPaths: string[] = [];
    const sceneDurations: number[] = [];

    for (let i = 0; i < plan.scenes.length; i++) {
      const s = plan.scenes[i];
      const sDir = sceneDir(i + 1);
      await fs.mkdir(sDir, { recursive: true });

      // Image
      let imagePath: string | null = null;
      try {
        imagePath = await generateImage(s.visualPrompt, path.join(sDir, "image.jpg"));
        if (imagePath) console.log(`[pipeline:${projectId}] Scene ${i + 1} image: OK`);
      } catch (e: any) {
        console.warn(`[pipeline:${projectId}] Scene ${i + 1} image failed: ${e.message}`);
      }
      if (imagePath) imagePaths.push(imagePath);

      // Audio (Piper TTS)
      let audioPath: string | null = null;
      if (piperAvail && piperModel) {
        try {
          const wavPath = path.join(sDir, "narration.wav");
          await generateSpeech({ text: s.narration, outputPath: wavPath });

          // Convert WAV → MP3 for smaller size
          try {
            const { wavToMp3 } = await import("./piper.js");
            audioPath = await wavToMp3(wavPath, ffmpegPath);
          } catch {
            audioPath = wavPath; // keep WAV if conversion fails
          }
          console.log(`[pipeline:${projectId}] Scene ${i + 1} audio: OK`);
        } catch (e: any) {
          console.warn(`[pipeline:${projectId}] Scene ${i + 1} TTS failed: ${e.message}`);
        }
      }
      if (audioPath) audioPaths.push(audioPath);
      sceneDurations.push(Number(s.durationSec) || 5);

      const record = await db.scene.create({
        data: {
          projectId,
          order: i + 1,
          narration: s.narration,
          visualPrompt: s.visualPrompt,
          durationSec: s.durationSec,
          imagePath: imagePath ?? null,
          audioPath: audioPath ?? null,
        },
      });
      sceneRecords.push(record);
    }

    if (!imagePaths.length) {
      throw new Error(
        "No images were generated. Ensure HF_TOKEN or OPENAI_API_KEY is set in .env"
      );
    }

    // ── Step 3: Merge audio, generate subtitles ──────────────────────────
    console.log(`[pipeline:${projectId}] Step 3/5: Generating subtitles...`);
    let srtPath: string | null = null;
    let vttPath: string | null = null;

    const hasRealAudio = audioPaths.length > 0;
    const whisperAvail = await isWhisperAvailable();

    if (hasRealAudio && whisperAvail) {
      // Merge all scene audio, then transcribe
      try {
        const mergedAudioPath = path.join(audioDir, "narration-full.mp3");
        if (audioPaths.length === 1) {
          await fs.copyFile(audioPaths[0], mergedAudioPath);
        } else {
          const concatFile = path.join(audioDir, "concat.txt");
          await fs.writeFile(
            concatFile,
            audioPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n")
          );
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const execP = promisify(execFile);
          await execP(ffmpegPath, ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c:a", "copy", mergedAudioPath]);
          await fs.unlink(concatFile).catch(() => {});
        }
        const result = await generateSubtitles(mergedAudioPath, captionsDir, {
          model: (process.env.WHISPER_MODEL as any) || "base",
          language: project.language === "English" ? "en" : undefined,
        });
        srtPath = result.srtPath;
        vttPath = result.vttPath;
      } catch (e: any) {
        console.warn(`[pipeline:${projectId}] Whisper failed: ${e.message}`);
        // Do NOT silently generate fake subtitles — leave srtPath null
        console.log(`[pipeline:${projectId}] Subtitles unavailable for this project`);
      }
    } else if (!whisperAvail && hasRealAudio) {
      console.warn(`[pipeline:${projectId}] Whisper unavailable — no subtitles generated`);
    } else if (!hasRealAudio) {
      // Generate text-based timing subtitles only when there is NO audio at all
      console.log(`[pipeline:${projectId}] No audio — generating timing-based subtitles from narration text`);
      const result = await generateSubtitlesFromText(
        plan.scenes.map((s) => s.narration),
        sceneDurations,
        captionsDir
      );
      srtPath = result.srtPath;
      vttPath = result.vttPath;
    }

    if (srtPath) {
      // Update all scenes with srt
      for (const r of sceneRecords) {
        await db.scene.update({ where: { id: r.id }, data: { srtPath } });
      }
    }

    // ── Step 4: Render video with FFmpeg ─────────────────────────────────
    console.log(`[pipeline:${projectId}] Step 4/5: Rendering video with FFmpeg...`);
    const outputPath = path.join(finalDir, "video.mp4");

    const renderResult = await renderVideo({
      images: imagePaths,
      audioPaths,
      srtPath: srtPath ?? undefined,
      outputPath,
      fps: 30,
      format: "vertical",
      sceneDurations,
    });

    // ── Step 5: Update project record ────────────────────────────────────
    console.log(`[pipeline:${projectId}] Step 5/5: Finalizing...`);
    const metadata = {
      caption: plan.caption,
      hashtags: plan.hashtags,
      cta: plan.cta,
      thumbnail: plan.thumbnail,
    };
    await db.project.update({
      where: { id: projectId },
      data: {
        status: "SUCCEEDED",
        videoPath: renderResult.outputPath,
        srtPath: srtPath ?? null,
        vttPath: vttPath ?? null,
        metadata: JSON.stringify(metadata),
        errorMsg: null,
      },
    });

    console.log(`[pipeline:${projectId}] ✔ Complete! Video: ${renderResult.outputPath}`);
    return {
      projectId,
      videoPath: renderResult.outputPath,
      srtPath: srtPath ?? null,
      scenesGenerated: sceneRecords.length,
      hasAudio: hasRealAudio,
      hasSubtitles: !!srtPath,
    };
  } catch (e: any) {
    await db.project.update({
      where: { id: projectId },
      data: { status: "FAILED", errorMsg: e.message },
    });
    throw e;
  }
}
