// Task-based smart routing.
//
// The idea: not all free models are equal. Codex/Coder models are better at
// code, DeepSeek-R1 is great at reasoning, MiniMax is solid for general chat.
// Instead of blind round-robin, we detect what the user is trying to do and
// prefer models that are good at that task. Then cascade to the rest.

import type { OpenRouterModel, ChatMessage } from "./types.js";

export type TaskCategory = "coding" | "reasoning" | "creative" | "general";

// Pattern-match model IDs to task categories. Order matters: first match wins.
// These patterns match against the model ID (e.g. "qwen/qwen-2.5-coder-32b-instruct:free").
const MODEL_TASK_PATTERNS: Array<{ pattern: RegExp; task: TaskCategory }> = [
  // Coding models — dedicated code-generation / code-completion models
  { pattern: /coder/i, task: "coding" },
  { pattern: /codestral/i, task: "coding" },
  { pattern: /starcoder/i, task: "coding" },
  { pattern: /deepseek-v3/i, task: "coding" },
  { pattern: /codegen/i, task: "coding" },
  { pattern: /gpt-oss/i, task: "coding" },      // OpenAI open-source models, strong at code

  // Reasoning models — chain-of-thought / deep thinking
  { pattern: /deepseek-r1/i, task: "reasoning" },
  { pattern: /qwq/i, task: "reasoning" },
  { pattern: /o1/i, task: "reasoning" },
  { pattern: /o3/i, task: "reasoning" },
  { pattern: /reasoning/i, task: "reasoning" },
  { pattern: /thinking/i, task: "reasoning" },   // e.g. lfm-2.5-1.2b-thinking

  // Creative / roleplay / writing models
  { pattern: /mytho/i, task: "creative" },
  { pattern: /toppy/i, task: "creative" },
  { pattern: /cinematika/i, task: "creative" },
  { pattern: /creative/i, task: "creative" },
  { pattern: /dolphin/i, task: "creative" },     // uncensored, good for creative writing
  { pattern: /venice/i, task: "creative" },
];

// Keywords in system/user messages that hint at a task.
const MESSAGE_TASK_SIGNALS: Array<{ keywords: RegExp; task: TaskCategory; weight: number }> = [
  // Coding signals
  { keywords: /\b(code|coding|program|function|implement|debug|refactor|typescript|javascript|python|rust|golang|sql|html|css|api|endpoint|bug|compile|syntax|variable|class|method|git|commit|deploy|npm|pip|cargo)\b/i, task: "coding", weight: 2 },
  { keywords: /```[\s\S]*```/,                    task: "coding", weight: 3 }, // code blocks = definitely code
  { keywords: /\b(fix this|write a script|build a|create a function|add a feature)\b/i, task: "coding", weight: 2 },

  // Reasoning signals
  { keywords: /\b(reason|think|step by step|analyze|prove|math|equation|calculate|logic|theorem|solve|derivat|integral|probability)\b/i, task: "reasoning", weight: 2 },
  { keywords: /\b(why does|how does|explain why|what causes|compare and contrast)\b/i, task: "reasoning", weight: 1 },

  // Creative signals
  { keywords: /\b(story|poem|write me|creative|fiction|novel|character|narrative|roleplay|imagine|scenario|dialogue|screenplay)\b/i, task: "creative", weight: 2 },
  { keywords: /\b(write a blog|essay|article|copywriting|tagline|slogan)\b/i, task: "creative", weight: 1 },
];

// Classify a model ID into a task category.
export function classifyModel(modelId: string): TaskCategory {
  for (const { pattern, task } of MODEL_TASK_PATTERNS) {
    if (pattern.test(modelId)) return task;
  }
  return "general";
}

// Build a full map of modelId → task for the current free model list.
export function buildModelTaskMap(models: OpenRouterModel[]): Map<string, TaskCategory> {
  const map = new Map<string, TaskCategory>();
  for (const m of models) {
    map.set(m.id, classifyModel(m.id));
  }
  return map;
}

// Detect the likely task from the chat messages. Looks at the system prompt
// and the last user message (where the actual ask lives). Returns the highest
// scoring category, or "general" if nothing stands out.
export function detectTask(messages: ChatMessage[]): TaskCategory {
  const scores: Record<TaskCategory, number> = {
    coding: 0,
    reasoning: 0,
    creative: 0,
    general: 0,
  };

  // Only scan system messages and the last 2 user messages to keep it fast.
  const relevantMessages = messages.filter((m) => {
    if (m.role === "system" || m.role === "developer") return true;
    if (m.role === "user") return true;
    return false;
  });
  const toScan = [
    ...relevantMessages.filter((m) => m.role === "system" || m.role === "developer"),
    ...relevantMessages.filter((m) => m.role === "user").slice(-2),
  ];

  for (const msg of toScan) {
    const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    for (const { keywords, task, weight } of MESSAGE_TASK_SIGNALS) {
      if (keywords.test(text)) {
        scores[task] += weight;
      }
    }
  }

  // Find winner. Needs at least 2 points to override "general" — avoids
  // false positives on casual mentions like "code name".
  let best: TaskCategory = "general";
  let bestScore = 1; // threshold: must beat 1 to override general
  for (const [task, score] of Object.entries(scores) as Array<[TaskCategory, number]>) {
    if (score > bestScore) {
      best = task;
      bestScore = score;
    }
  }
  return best;
}

// Allow callers to explicitly set the task via a custom header or model prefix.
// Supported formats:
//   Header: x-always-llm-task: coding
//   Model:  coding:meta-llama/llama-3.3-70b-instruct:free  (prefix stripped before forwarding)
export function parseExplicitTask(
  header: string | undefined,
  model: string | undefined,
): { task: TaskCategory | null; cleanModel: string | undefined } {
  if (header) {
    const h = header.trim().toLowerCase();
    if (h === "coding" || h === "reasoning" || h === "creative" || h === "general") {
      return { task: h, cleanModel: model };
    }
  }

  if (model) {
    const prefixMatch = model.match(/^(coding|reasoning|creative|general):(.+)$/);
    if (prefixMatch) {
      return {
        task: prefixMatch[1] as TaskCategory,
        cleanModel: prefixMatch[2],
      };
    }
  }

  return { task: null, cleanModel: model };
}
