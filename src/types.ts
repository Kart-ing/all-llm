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

export interface ModelArchitecture {
  modality?: string;             // e.g. "text->text", "text+image->text+audio"
  input_modalities?: string[];   // e.g. ["text"], ["text", "image"]
  output_modalities?: string[];  // e.g. ["text"], ["text", "audio"]
  tokenizer?: string;
  instruct_type?: string | null;
}

export interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
  };
  context_length?: number;
  architecture?: ModelArchitecture;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  [key: string]: unknown;
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

// Internal enriched model with computed quality score.
export interface RankedModel extends OpenRouterModel {
  sizeB: number;      // estimated params in billions
  qualityScore: number; // composite: 70% size + 30% context
}
