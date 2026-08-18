/**
 * Modular AI Provider System
 *
 * Providers:
 *   HuggingFaceTextProvider  — text/script generation via HF Inference API
 *   HuggingFaceImageProvider — image generation via HF Inference API
 *   OpenAIProvider           — OpenAI text + image
 *   LocalProvider            — deterministic offline fallback (no AI calls)
 *
 * Factory: getTextProvider() and getImageProvider() pick from env.
 * HF_TOKEN is never logged or returned in API responses.
 */

import fs from "node:fs/promises";
import path from "node:path";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface ScenePlan {
  title: string;
  hook: string;
  scenes: Array<{
    order: number;
    narration: string;
    visualPrompt: string;
    durationSec: number;
  }>;
  caption: string;
  hashtags: string[];
  cta: string;
  thumbnail: string;
}

export interface ScriptOpts {
  prompt: string;
  language: string;
  durationSec: number;
  style: string;
  platform: string;
  tone: string;
  hookStyle?: string;
}

// ─── Text Provider Interface ──────────────────────────────────────────────────

export interface TextProvider {
  readonly name: string;
  generateScript(opts: ScriptOpts): Promise<ScenePlan>;
  generateIdeas(niche: string, count: number): Promise<string[]>;
  generateMetadata(plan: ScenePlan, platform: string): Promise<PlatformMetadata>;
}

export interface PlatformMetadata {
  title: string;
  description: string;
  caption: string;
  hashtags: string[];
  keywords: string[];
  cta: string;
}

// ─── Image Provider Interface ─────────────────────────────────────────────────

export interface ImageProvider {
  readonly name: string;
  generateImage(prompt: string, outFile: string): Promise<string | null>;
}

// ─── Local / Fallback Provider ────────────────────────────────────────────────

export class LocalProvider implements TextProvider, ImageProvider {
  readonly name = "local";

  async generateScript(opts: ScriptOpts): Promise<ScenePlan> {
    const sceneCount = Math.max(3, Math.round(opts.durationSec / 8));
    const durEach = Math.max(4, Math.round(opts.durationSec / sceneCount));
    return {
      title: opts.prompt.slice(0, 70),
      hook: `You won't believe these facts about: ${opts.prompt}.`,
      scenes: Array.from({ length: sceneCount }, (_, i) => ({
        order: i + 1,
        narration: `Scene ${i + 1}: Here is an important insight about ${opts.prompt} that you should know about.`,
        visualPrompt: `Cinematic portrait video still, ${opts.prompt}, dramatic lighting, clean composition, photorealistic, no text`,
        durationSec: durEach,
      })),
      caption: `${opts.prompt} — which fact surprised you most? 👇`,
      hashtags: ["#facts", "#educational", "#viral", "#shorts", "#learnontiktok"],
      cta: "Follow for more amazing content! 🔥",
      thumbnail: `Bold dramatic thumbnail for ${opts.prompt}`,
    };
  }

  async generateIdeas(niche: string, count: number): Promise<string[]> {
    const templates = [
      `${count} surprising facts about ${niche}`,
      `What nobody tells you about ${niche}`,
      `The dark side of ${niche} nobody talks about`,
      `${niche} — explained in 60 seconds`,
      `Why ${niche} is changing everything`,
      `${count} things I wish I knew about ${niche}`,
      `The truth about ${niche}`,
      `How ${niche} actually works`,
    ];
    return templates.slice(0, count);
  }

  async generateMetadata(plan: ScenePlan, platform: string): Promise<PlatformMetadata> {
    const tags = plan.hashtags.slice(0, 5);
    return {
      title: plan.title,
      description: `${plan.hook}\n\n${plan.cta}`,
      caption: plan.caption,
      hashtags: tags,
      keywords: tags.map((t) => t.replace("#", "")),
      cta: plan.cta,
    };
  }

  async generateImage(_prompt: string, _outFile: string): Promise<string | null> {
    return null; // No local image generation — requires HF or OpenAI
  }
}

// ─── HuggingFace Text Provider ────────────────────────────────────────────────

export class HuggingFaceTextProvider implements TextProvider {
  readonly name = "huggingface-text";
  private readonly textModel: string;

  constructor() {
    this.textModel =
      process.env.HF_TEXT_MODEL ||
      "mistralai/Mistral-7B-Instruct-v0.3";
  }

  private get token(): string {
    return process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "";
  }

  private async infer(prompt: string, maxTokens = 2048): Promise<string> {
    if (!this.token) throw new Error("HF_TOKEN not set");

    const body: Record<string, unknown> = {
      inputs: prompt,
      parameters: {
        max_new_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.95,
        return_full_text: false,
        do_sample: true,
      },
    };

    const res = await fetch(
      `https://api-inference.huggingface.co/models/${this.textModel}`,
      {
        method: "POST",
        headers: {
          // Token intentionally not logged — kept server-side only
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (res.status === 503) {
      // Model loading
      const wait = parseInt(res.headers.get("X-Wait-For-Model") || "20000");
      console.log(`[hf-text] Model loading, waiting ${wait}ms...`);
      await new Promise((r) => setTimeout(r, Math.min(wait, 30000)));
      return this.infer(prompt, maxTokens); // retry once
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HF text API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as
      | Array<{ generated_text: string }>
      | { generated_text: string };
    if (Array.isArray(data)) return data[0]?.generated_text || "";
    return (data as any).generated_text || "";
  }

  private extractJson(raw: string): unknown {
    // Try to find { ... } block in potentially messy model output
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in AI response");
    return JSON.parse(match[0]);
  }

  async generateScript(opts: ScriptOpts): Promise<ScenePlan> {
    const sceneCount = Math.max(3, Math.round(opts.durationSec / 8));
    const durEach = Math.max(4, Math.round(opts.durationSec / sceneCount));

    const sysPrompt = `You are an expert viral short-form video scriptwriter. You always respond with valid JSON only — no explanation, no markdown code blocks.`;
    const userPrompt = `Create a ${opts.style} video script for: "${opts.prompt}"
Language: ${opts.language} | Duration: ${opts.durationSec}s | Platform: ${opts.platform} | Tone: ${opts.tone}
Scenes: ${sceneCount} scenes of approximately ${durEach}s each.

Return ONLY this JSON structure:
{
  "title": "compelling title max 70 chars",
  "hook": "hook line that grabs attention in 1-2 sentences",
  "scenes": [
    {"order": 1, "narration": "narrator text for scene 1", "visualPrompt": "detailed image prompt for scene 1", "durationSec": ${durEach}}
  ],
  "caption": "platform caption with emojis",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "cta": "call to action",
  "thumbnail": "thumbnail visual concept"
}`;

    const full = `[INST] ${sysPrompt}\n\n${userPrompt} [/INST]`;

    let raw = "";
    try {
      raw = await this.infer(full, 1500);
      const parsed = this.extractJson(raw) as Partial<ScenePlan>;
      // Validate + fill defaults
      const scenes = (parsed.scenes || []).map((s: any, i: number) => ({
        order: Number(s.order ?? i + 1),
        narration: String(s.narration ?? `Scene ${i + 1}`),
        visualPrompt: String(s.visualPrompt ?? opts.prompt),
        durationSec: Number(s.durationSec ?? durEach),
      }));
      return {
        title: String(parsed.title ?? opts.prompt).slice(0, 70),
        hook: String(parsed.hook ?? `Amazing facts about ${opts.prompt}`),
        scenes: scenes.length ? scenes : new LocalProvider().generateScript(opts).then((p) => p.scenes),
        caption: String(parsed.caption ?? opts.prompt),
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : ["#viral"],
        cta: String(parsed.cta ?? "Follow for more!"),
        thumbnail: String(parsed.thumbnail ?? opts.prompt),
      } as ScenePlan;
    } catch (e: any) {
      console.warn(`[hf-text] Script generation failed: ${e.message} — using local fallback`);
      return new LocalProvider().generateScript(opts);
    }
  }

  async generateIdeas(niche: string, count: number): Promise<string[]> {
    const prompt = `[INST] Generate ${count} viral short-form video ideas for the niche: "${niche}".
Return ONLY a JSON array of strings: ["idea 1","idea 2",...] [/INST]`;
    try {
      const raw = await this.infer(prompt, 512);
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        const arr = JSON.parse(arrMatch[0]) as unknown[];
        return arr.filter((x) => typeof x === "string").map(String).slice(0, count);
      }
    } catch (e: any) {
      console.warn(`[hf-text] Ideas generation failed: ${e.message}`);
    }
    return new LocalProvider().generateIdeas(niche, count);
  }

  async generateMetadata(plan: ScenePlan, platform: string): Promise<PlatformMetadata> {
    const prompt = `[INST] Create platform-specific metadata for a "${platform}" video titled: "${plan.title}".
Return ONLY JSON: {"title":"","description":"","caption":"","hashtags":[],"keywords":[],"cta":""} [/INST]`;
    try {
      const raw = await this.infer(prompt, 512);
      const parsed = this.extractJson(raw) as Partial<PlatformMetadata>;
      return {
        title: String(parsed.title ?? plan.title),
        description: String(parsed.description ?? plan.hook),
        caption: String(parsed.caption ?? plan.caption),
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : plan.hashtags,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
        cta: String(parsed.cta ?? plan.cta),
      };
    } catch {
      return new LocalProvider().generateMetadata(plan, platform);
    }
  }
}

// ─── HuggingFace Image Provider ───────────────────────────────────────────────

export class HuggingFaceImageProvider implements ImageProvider {
  readonly name = "huggingface-image";
  private readonly imageModel: string;

  constructor() {
    // Default: a reliable text-to-image model on HF
    this.imageModel =
      process.env.HF_IMAGE_MODEL ||
      "stabilityai/stable-diffusion-xl-base-1.0";
  }

  private get token(): string {
    return process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "";
  }

  async generateImage(prompt: string, outFile: string): Promise<string | null> {
    if (!this.token) {
      console.warn("[hf-image] HF_TOKEN not set — image generation skipped");
      return null;
    }

    const enhancedPrompt = `${prompt}, vertical portrait format, cinematic, high quality, photorealistic, dramatic lighting, 4K`;

    try {
      const res = await fetch(
        `https://api-inference.huggingface.co/models/${this.imageModel}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`, // token never logged
            "Content-Type": "application/json",
            "X-Wait-For-Model": "true",
          },
          body: JSON.stringify({
            inputs: enhancedPrompt,
            parameters: {
              negative_prompt: "text, watermark, logo, blurry, low quality, distorted",
              num_inference_steps: 20,
              guidance_scale: 7.5,
            },
          }),
        }
      );

      if (res.status === 503) {
        console.log(`[hf-image] Model loading, retrying in 20s...`);
        await new Promise((r) => setTimeout(r, 20000));
        return this.generateImage(prompt, outFile);
      }

      if (!res.ok) {
        console.warn(`[hf-image] API ${res.status}: ${(await res.text()).slice(0, 150)}`);
        return null;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("image")) {
        console.warn(`[hf-image] Unexpected content-type: ${contentType}`);
        return null;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 1000) {
        console.warn(`[hf-image] Response too small (${buffer.length} bytes), skipping`);
        return null;
      }

      await fs.mkdir(path.dirname(outFile), { recursive: true });
      await fs.writeFile(outFile, buffer);
      console.log(`[hf-image] Generated ${Math.round(buffer.length / 1024)}KB: ${path.basename(outFile)}`);
      return outFile;
    } catch (e: any) {
      console.warn(`[hf-image] Generation failed: ${e.message}`);
      return null;
    }
  }
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

export class OpenAIProvider implements TextProvider, ImageProvider {
  readonly name = "openai";
  private _client: any = null;

  private async client() {
    if (!this._client) {
      const { default: OpenAI } = await import("openai");
      this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this._client;
  }

  async generateScript(opts: ScriptOpts): Promise<ScenePlan> {
    const c = await this.client();
    const sceneCount = Math.max(3, Math.round(opts.durationSec / 8));
    const durEach = Math.max(4, Math.round(opts.durationSec / sceneCount));
    const res = await c.chat.completions.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a viral short-form video scriptwriter. Respond with valid JSON only." },
        { role: "user", content: `Create a ${opts.style} script for: "${opts.prompt}". Language: ${opts.language}. Duration: ${opts.durationSec}s. Platform: ${opts.platform}. ${sceneCount} scenes of ${durEach}s each.\nJSON: {title,hook,scenes:[{order,narration,visualPrompt,durationSec}],caption,hashtags,cta,thumbnail}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });
    return JSON.parse(res.choices[0].message.content!) as ScenePlan;
  }

  async generateIdeas(niche: string, count: number): Promise<string[]> {
    const c = await this.client();
    const res = await c.chat.completions.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Return JSON array only." },
        { role: "user", content: `Generate ${count} viral video ideas for niche: "${niche}". Return as JSON array of strings.` },
      ],
      response_format: { type: "json_object" },
    });
    const data = JSON.parse(res.choices[0].message.content!);
    return (data.ideas || data.results || Object.values(data)[0] || []) as string[];
  }

  async generateMetadata(plan: ScenePlan, platform: string): Promise<PlatformMetadata> {
    const c = await this.client();
    const res = await c.chat.completions.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: `Generate ${platform} metadata for video: "${plan.title}". JSON: {title,description,caption,hashtags,keywords,cta}` },
      ],
      response_format: { type: "json_object" },
    });
    return JSON.parse(res.choices[0].message.content!) as PlatformMetadata;
  }

  async generateImage(prompt: string, outFile: string): Promise<string | null> {
    if (!process.env.OPENAI_API_KEY) return null;
    const c = await this.client();
    const result = await c.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "dall-e-3",
      prompt: `${prompt}, vertical portrait 9:16, cinematic, high quality`,
      size: "1024x1792",
      n: 1,
    });
    const url = result.data?.[0]?.url;
    if (!url) return null;
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, buffer);
    return outFile;
  }
}

// ─── Provider Factories ───────────────────────────────────────────────────────

let _textProvider: TextProvider | null = null;
let _imageProvider: ImageProvider | null = null;

export function getTextProvider(): TextProvider {
  if (_textProvider) return _textProvider;
  const pref = (process.env.AI_PROVIDER || "").toLowerCase();

  if (pref === "openai" && process.env.OPENAI_API_KEY) {
    _textProvider = new OpenAIProvider();
  } else if (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN) {
    _textProvider = new HuggingFaceTextProvider();
  } else if (process.env.OPENAI_API_KEY) {
    _textProvider = new OpenAIProvider();
  } else {
    _textProvider = new LocalProvider();
    console.warn("[ai] No AI provider configured — using local fallback. Set HF_TOKEN or OPENAI_API_KEY.");
  }
  console.log(`[ai] Text provider: ${_textProvider.name}`);
  return _textProvider;
}

export function getImageProvider(): ImageProvider {
  if (_imageProvider) return _imageProvider;
  const pref = (process.env.AI_PROVIDER || "").toLowerCase();

  if (pref === "openai" && process.env.OPENAI_API_KEY) {
    _imageProvider = new OpenAIProvider();
  } else if (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN) {
    _imageProvider = new HuggingFaceImageProvider();
  } else if (process.env.OPENAI_API_KEY) {
    _imageProvider = new OpenAIProvider();
  } else {
    _imageProvider = new LocalProvider();
  }
  console.log(`[ai] Image provider: ${_imageProvider.name}`);
  return _imageProvider;
}

// ─── Convenience exports (used by server / pipeline) ──────────────────────────

export async function planVideo(
  prompt: string,
  language: string,
  durationSec: number,
  style: string,
  platform = "YouTube",
  tone = "Engaging"
): Promise<ScenePlan> {
  return getTextProvider().generateScript({ prompt, language, durationSec, style, platform, tone });
}

export async function generateImage(prompt: string, outFile: string): Promise<string | null> {
  return getImageProvider().generateImage(prompt, outFile);
}

export async function generateIdeas(niche: string, count = 10): Promise<string[]> {
  return getTextProvider().generateIdeas(niche, count);
}

export async function generatePlatformMetadata(plan: ScenePlan, platform: string): Promise<PlatformMetadata> {
  return getTextProvider().generateMetadata(plan, platform);
}