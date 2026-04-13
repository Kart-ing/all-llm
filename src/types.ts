// OpenAI-compatible request/response shapes. We keep these intentionally
// loose: anything we don't explicitly care about is forwarded as-is so that
// new OpenRouter / OpenAI fields don't require code changes.

export interface Env {
  OPENROUTER_API_KEY?: string;
  SITE_URL?: string;
  SITE_NAME?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer";
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  // Anything else (temperature, top_p, tools, response_format, ...) is passed
  // through verbatim. We type it as unknown to keep the proxy transparent.
  [key: string]: unknown;
}

export interface OpenRouterModel {
  id: string;
  name?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
  };
  context_length?: number;
  [key: string]: unknown;
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}
