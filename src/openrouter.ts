import type { Env } from "./types.js";
import { RETRYABLE_STATUSES, markCooldown } from "./router.js";

const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface AttemptResult {
  response: Response;
  model: string;
}

function buildHeaders(apiKey: string, env: Env): HeadersInit {
  // OpenRouter requires (well, strongly prefers) these two for attribution.
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": env.SITE_URL ?? "https://github.com/Kart-ing/all-llm",
    "X-Title": env.SITE_NAME ?? "always-llm",
  };
}

// Try models in `rotation` order until one responds with a non-retryable
// status (2xx OR a hard client error like 400/401). Retryable failures put
// the model on cooldown and we move on.
//
// IMPORTANT: if `body.stream === true` we still only rotate on the *initial*
// HTTP status. Once bytes start flowing we can't safely retry — the caller
// has already received half a stream, and SSE events from a different model
// mid-conversation would corrupt state. See README "How rotation works".
export async function callWithRotation(
  rotation: string[],
  body: Record<string, unknown>,
  apiKey: string,
  env: Env,
): Promise<AttemptResult> {
  const headers = buildHeaders(apiKey, env);
  let lastResponse: Response | null = null;
  let lastModel = rotation[0] ?? "unknown";

  for (const model of rotation) {
    const payload = { ...body, model };
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (RETRYABLE_STATUSES.has(res.status)) {
      markCooldown(model);
      // Drain the body so the connection can be reused.
      try {
        await res.body?.cancel();
      } catch {
        // ignore
      }
      lastResponse = res;
      lastModel = model;
      continue;
    }

    // Non-retryable — either success or a hard error we should surface.
    return { response: res, model };
  }

  // Everyone 429'd (or similar). Return the final response we saw so the
  // caller at least gets a real OpenRouter error body instead of a synthetic
  // one we had to invent.
  if (lastResponse) return { response: lastResponse, model: lastModel };

  return {
    response: new Response(
      JSON.stringify({
        error: {
          message: "No free models available — rotation list was empty.",
          type: "always_llm_no_models",
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    ),
    model: "none",
  };
}
