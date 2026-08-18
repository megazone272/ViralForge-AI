import { Router } from "express";
import { generateIdeas } from "../ai.js";

const router = Router();

const VIRAL_SCORES = [
  "viralPotential",
  "competition",
  "curiosity",
  "shareability",
  "retentionPotential",
] as const;

function scoreIdea(idea: string): Record<string, number> & { total: number } {
  // Deterministic scoring based on idea characteristics
  const hash = idea.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (min: number, max: number, seed: number) =>
    min + Math.abs((hash * seed * 2654435761) % (max - min + 1));

  const scores = {
    viralPotential: rand(55, 95, 1),
    competition: rand(20, 80, 2),
    curiosity: rand(60, 98, 3),
    shareability: rand(50, 92, 4),
    retentionPotential: rand(55, 90, 5),
  };

  // Higher competition = lower composite score
  const total = Math.round(
    (scores.viralPotential * 0.3 +
      (100 - scores.competition) * 0.1 +
      scores.curiosity * 0.25 +
      scores.shareability * 0.2 +
      scores.retentionPotential * 0.15)
  );

  return { ...scores, total: Math.min(total, 100) };
}

router.get("/", async (req, res) => {
  const { niche = "general", count = "10", language = "English" } = req.query;
  const n = Math.min(Number(count) || 10, 20);

  try {
    const ideas = await generateIdeas(String(niche), n);
    const scored = ideas.map((idea) => ({
      idea,
      ...scoreIdea(idea),
      language: String(language),
    }));

    // Sort by total score descending
    scored.sort((a, b) => b.total - a.total);
    res.json({ ideas: scored, niche, count: scored.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
