import type { OpenRouterModel, OpenRouterModelsResponse, RankedModel } from "./types.js";

// ---------------------------------------------------------------------------
// Fallback free models — used when the OpenRouter /models fetch fails.
// Ordered by quality score (best first). Updated 2026-04-13.
// ---------------------------------------------------------------------------
export const FALLBACK_FREE_MODELS: string[] = [
  "qwen/qwen3-coder:free",                                   // 480B MoE, coding beast
  "nousresearch/hermes-3-llama-3.1-405b:free",               // 405B dense
  "nvidia/nemotron-3-super-120b-a12b:free",                  // 120B MoE, 262k ctx
  "openai/gpt-oss-120b:free",                                // 120B
  "qwen/qwen3-next-80b-a3b-instruct:free",                   // 80B MoE
  "meta-llama/llama-3.3-70b-instruct:free",                  // 70B dense
  "minimax/minimax-m2.5:free",                               // ~100B, 196k ctx
  "openrouter/elephant-alpha",                               // 100B, 262k ctx
  "arcee-ai/trinity-large-preview:free",                     // ~70B estimated
  "google/gemma-4-31b-it:free",                              // 31B, 262k ctx
  "nvidia/nemotron-3-nano-30b-a3b:free",                     // 30B MoE
  "z-ai/glm-4.5-air:free",                                  // ~30B estimated
  "google/gemma-3-27b-it:free",                              // 27B
  "google/gemma-4-26b-a4b-it:free",                          // 26B
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-3-12b-it:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "google/gemma-3-4b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

// ---------------------------------------------------------------------------
// Size overrides for models whose ID/name doesn't contain a parseable "NNb".
// Values are best-effort estimates in billions of parameters.
// ---------------------------------------------------------------------------
const KNOWN_SIZES: Record<string, number> = {
  "openrouter/elephant-alpha": 100,
  "minimax/minimax-m2.5:free": 100,
  "z-ai/glm-4.5-air:free": 30,
  "arcee-ai/trinity-large-preview:free": 70,
};

const MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedModels {
  fetchedAt: number;
  ids: string[];
  full: RankedModel[];
}

let cache: CachedModels | null = null;

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function isFree(model: OpenRouterModel): boolean {
  const p = model.pricing;
  if (!p) return false;
  return p.prompt === "0" && p.completion === "0";
}

// Only keep models that output text. Exclude audio generators (Lyria),
// image generators, video generators, etc. Also exclude the openrouter/free
// meta-router since we ARE the router.
function isTextModel(model: OpenRouterModel): boolean {
  if (model.id === "openrouter/free") return false;

  const out = model.architecture?.output_modalities;
  if (!out || out.length === 0) {
    // No architecture info — assume text (older entries).
    return true;
  }
  // Must output text, and ONLY text. A model that outputs ["text", "audio"]
  // is a music/TTS model that happens to also emit text — not what we want.
  return out.length === 1 && out[0] === "text";
}

// ---------------------------------------------------------------------------
// Size extraction + quality scoring
// ---------------------------------------------------------------------------

// Extract parameter count (billions) from model ID or name.
// Handles: "70b", "120b-a12b" (MoE total), "480B A35B", "1.2b", etc.
function extractSizeB(model: OpenRouterModel): number {
  // Check override map first
  if (KNOWN_SIZES[model.id] !== undefined) return KNOWN_SIZES[model.id]!;

  const haystack = `${model.id} ${model.name ?? ""}`;

  // Try MoE pattern first: "120b-a12b" or "480B A35B" — use the total param count
  const moe = haystack.match(/(\d+\.?\d*)\s*[bB]\s*[-_]?\s*[aA](\d+\.?\d*)\s*[bB]/);
  if (moe) return parseFloat(moe[1]!);

  // Standard: last occurrence of a number followed by "b" (case insensitive).
  // "last" because IDs often have version numbers like "3.3" before the size.
  const matches = [...haystack.matchAll(/(\d+\.?\d*)\s*[bB](?!\w)/gi)];
  if (matches.length > 0) return parseFloat(matches[matches.length - 1]![1]!);

  // Description might say "100B-parameter" etc.
  const desc = model.description ?? "";
  const descMatch = desc.match(/(\d+\.?\d*)\s*[bB][-\s]param/i);
  if (descMatch) return parseFloat(descMatch[1]!);

  return 0;
}

// Composite quality score. Higher = better model to try first.
//   70% model size (bigger = smarter, usually)
//   30% context window (bigger = more useful)
// Both are log-scaled so a 405B model doesn't drown out everything else.
function computeQualityScore(sizeB: number, contextLength: number): number {
  const sizeScore = sizeB > 0 ? Math.log2(sizeB) : 0;       // log2(405) ≈ 8.66
  const ctxScore = contextLength > 0 ? Math.log2(contextLength / 1024) : 0; // log2(256) ≈ 8
  return 0.7 * sizeScore + 0.3 * ctxScore;
}

function rankModels(models: OpenRouterModel[]): RankedModel[] {
  const ranked: RankedModel[] = models.map((m) => {
    const sizeB = extractSizeB(m);
    const ctx = m.context_length ?? 0;
    return {
      ...m,
      sizeB,
      qualityScore: computeQualityScore(sizeB, ctx),
    };
  });
  // Sort descending by quality score — best models first.
  ranked.sort((a, b) => b.qualityScore - a.qualityScore);
  return ranked;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getFreeModels(
  apiKey?: string,
  now: number = Date.now(),
): Promise<{ ids: string[]; source: "cache" | "network" | "fallback" }> {
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { ids: cache.ids, source: "cache" };
  }

  try {
    const res = await fetch(MODELS_ENDPOINT, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) throw new Error(`models endpoint: ${res.status}`);
    const body = (await res.json()) as OpenRouterModelsResponse;

    const free = (body.data ?? []).filter((m) => isFree(m) && isTextModel(m));
    if (free.length === 0) throw new Error("no usable free models in response");

    const ranked = rankModels(free);
    const ids = ranked.map((m) => m.id);
    cache = { fetchedAt: now, ids, full: ranked };
    return { ids, source: "network" };
  } catch {
    // Fall back to the hardcoded list; cache it short so we retry soon.
    const fallbackRanked: RankedModel[] = FALLBACK_FREE_MODELS.map((id) => ({
      id,
      sizeB: KNOWN_SIZES[id] ?? 0,
      qualityScore: 0,
    }));
    cache = {
      fetchedAt: now - (CACHE_TTL_MS - 5 * 60 * 1000), // expires in 5 min
      ids: FALLBACK_FREE_MODELS,
      full: fallbackRanked,
    };
    return { ids: FALLBACK_FREE_MODELS, source: "fallback" };
  }
}

export async function getFreeModelsFull(
  apiKey?: string,
): Promise<RankedModel[]> {
  await getFreeModels(apiKey);
  return cache?.full ?? [];
}
