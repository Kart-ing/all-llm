import type { OpenRouterModel, OpenRouterModelsResponse } from "./types.js";

// Known-good free models on OpenRouter. Used when the /models fetch fails
// (network error, OpenRouter outage, etc.) so the proxy still boots.
// Keep this list short and high-quality — it's the floor, not the ceiling.
export const FALLBACK_FREE_MODELS: string[] = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1:free",
  "deepseek/deepseek-chat:free",
  "google/gemini-2.0-flash-exp:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "microsoft/phi-3-medium-128k-instruct:free",
];

const MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedModels {
  fetchedAt: number;
  ids: string[];
  full: OpenRouterModel[];
}

let cache: CachedModels | null = null;

function isFree(model: OpenRouterModel): boolean {
  const p = model.pricing;
  if (!p) return false;
  // OpenRouter reports prices as strings like "0" or "0.000001".
  return p.prompt === "0" && p.completion === "0";
}

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
    const free = (body.data ?? []).filter(isFree);
    const ids = free.map((m) => m.id);
    if (ids.length === 0) throw new Error("no free models in response");
    cache = { fetchedAt: now, ids, full: free };
    return { ids, source: "network" };
  } catch {
    // Fall back to the hardcoded list; cache it short so we retry soon.
    cache = {
      fetchedAt: now - (CACHE_TTL_MS - 5 * 60 * 1000), // expires in 5 min
      ids: FALLBACK_FREE_MODELS,
      full: FALLBACK_FREE_MODELS.map((id) => ({ id })),
    };
    return { ids: FALLBACK_FREE_MODELS, source: "fallback" };
  }
}

export async function getFreeModelsFull(
  apiKey?: string,
): Promise<OpenRouterModel[]> {
  await getFreeModels(apiKey);
  return cache?.full ?? FALLBACK_FREE_MODELS.map((id) => ({ id }));
}
