import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, ChatCompletionRequest } from "./types.js";
import { getFreeModels, getFreeModelsFull } from "./models.js";
import { buildRotation } from "./router.js";
import { callWithRotation } from "./openrouter.js";
import { detectTask, parseExplicitTask } from "./tasks.js";
import type { TaskCategory } from "./tasks.js";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/", (c) =>
  c.json({
    name: "always-llm",
    description:
      "OpenAI-compatible proxy that rotates across free OpenRouter models with task-aware smart routing.",
    endpoints: ["/v1/chat/completions", "/v1/models"],
    repo: "https://github.com/Kart-ing/all-llm",
  }),
);

// Resolve the OpenRouter API key from either the incoming Authorization
// header (so callers BYO-key) or the environment secret (so operators can
// host it for themselves).
function resolveKey(c: { req: { header: (k: string) => string | undefined } }, env: Env): string | null {
  const auth = c.req.header("Authorization") ?? c.req.header("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return env.OPENROUTER_API_KEY ?? null;
}

app.get("/v1/models", async (c) => {
  const env = c.env;
  const key = resolveKey(c, env) ?? undefined;
  const models = await getFreeModelsFull(key);
  return c.json({
    object: "list",
    data: models.map((m) => ({
      id: m.id,
      object: "model",
      created: 0,
      owned_by: "openrouter",
      pricing: m.pricing,
      context_length: m.context_length,
    })),
  });
});

app.post("/v1/chat/completions", async (c) => {
  const env = c.env;
  const key = resolveKey(c, env);
  if (!key) {
    return c.json(
      {
        error: {
          message:
            "Missing OpenRouter API key. Pass it as `Authorization: Bearer sk-or-...` or set OPENROUTER_API_KEY.",
          type: "always_llm_missing_key",
        },
      },
      401,
    );
  }

  let body: ChatCompletionRequest;
  try {
    body = (await c.req.json()) as ChatCompletionRequest;
  } catch {
    return c.json(
      { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
      400,
    );
  }

  // --- Task detection ---
  // Priority: explicit header > model prefix > auto-detect from messages
  const taskHeader = c.req.header("x-always-llm-task");
  const { task: explicitTask, cleanModel } = parseExplicitTask(taskHeader, body.model);
  const detectedTask: TaskCategory = explicitTask ?? detectTask(body.messages);

  // If the model had a task prefix (e.g. "coding:meta-llama/..."), strip it
  // before forwarding to OpenRouter.
  const preferredModel = cleanModel;

  const { ids: freeIds } = await getFreeModels(key);
  const rotation = buildRotation(freeIds, preferredModel, detectedTask);
  if (rotation.length === 0) {
    return c.json(
      {
        error: {
          message: "No free models currently available.",
          type: "always_llm_no_models",
        },
      },
      503,
    );
  }

  // Forward with the cleaned model (no task prefix) in the body
  const forwardBody = { ...body, model: preferredModel } as unknown as Record<string, unknown>;
  const { response, model } = await callWithRotation(rotation, forwardBody, key, env);

  // Clone headers so we can add our own. We preserve content-type, which
  // matters for SSE streaming vs JSON.
  const outHeaders = new Headers(response.headers);
  outHeaders.set("x-always-llm-model", model);
  outHeaders.set("x-always-llm-task", detectedTask);

  // For streaming responses, pipe the ReadableStream straight through. We
  // deliberately do NOT try to recover mid-stream — see openrouter.ts for
  // why. If the response is non-2xx we also pass it through as-is so the
  // OpenAI SDK sees a real error.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
});

export default app;
