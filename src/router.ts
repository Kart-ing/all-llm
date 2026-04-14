// Rotation + cooldown bookkeeping.
//
// v0.1 keeps this in-memory on the Worker isolate. That means:
//   * different isolates have independent cooldown maps
//   * cooldowns vanish when an isolate is recycled
//
// Both are fine for "vibe coding" traffic patterns. v0.2 will move this to
// Cloudflare KV (or a Durable Object) so cooldowns are truly global.

import type { TaskCategory } from "./tasks.js";
import { classifyModel } from "./tasks.js";

const cooldowns = new Map<string, number>(); // modelId -> unix ms until which it's on cooldown

// Round-robin pointer across the free-model list. Not per-user — a single
// shared pointer is fine and keeps load roughly evenly distributed.
let rrPointer = 0;

export const COOLDOWN_MS = 60 * 1000;

// HTTP status codes that mean "this model is temporarily unhappy — try the
// next one". 402 = out of credits, 429 = rate limited, 5xx = upstream wobble.
export const RETRYABLE_STATUSES = new Set([402, 429, 502, 503, 504]);

export function isOnCooldown(model: string, now: number = Date.now()): boolean {
  const until = cooldowns.get(model);
  if (until === undefined) return false;
  if (until <= now) {
    cooldowns.delete(model);
    return false;
  }
  return true;
}

export function markCooldown(model: string, now: number = Date.now()): void {
  cooldowns.set(model, now + COOLDOWN_MS);
}

// Build the ordered list of models to try for this request.
//
// Task-aware rotation order:
//   1. User's preferred model (if specified and not on cooldown)
//   2. Task-matched models — models classified as matching the detected task
//      (round-robin, skip cooldowns)
//   3. General / remaining models — everything else as fallback cascade
//
// This means a coding request will try qwen-coder and deepseek-v3 before
// falling back to llama-instruct or gemini-flash.
export function buildRotation(
  freeModels: string[],
  preferred?: string,
  task: TaskCategory = "general",
): string[] {
  const order: string[] = [];
  const seen = new Set<string>();

  // 1. Preferred model first
  if (preferred && !isOnCooldown(preferred)) {
    order.push(preferred);
    seen.add(preferred);
  }

  if (freeModels.length === 0) return order;

  // Partition models into task-matched and rest.
  // For "general" task we skip partitioning — just round-robin everything.
  const taskMatched: string[] = [];
  const rest: string[] = [];

  if (task !== "general") {
    for (const id of freeModels) {
      if (seen.has(id)) continue;
      if (classifyModel(id) === task) {
        taskMatched.push(id);
      } else {
        rest.push(id);
      }
    }
  } else {
    for (const id of freeModels) {
      if (!seen.has(id)) rest.push(id);
    }
  }

  // 2. Task-matched models (round-robin within this tier)
  const n1 = taskMatched.length;
  if (n1 > 0) {
    const start = rrPointer % n1;
    for (let i = 0; i < n1; i++) {
      const id = taskMatched[(start + i) % n1]!;
      if (isOnCooldown(id)) continue;
      order.push(id);
      seen.add(id);
    }
  }

  // 3. Cascade: remaining models (round-robin within this tier)
  const n2 = rest.length;
  if (n2 > 0) {
    const start = rrPointer % n2;
    for (let i = 0; i < n2; i++) {
      const id = rest[(start + i) % n2]!;
      if (seen.has(id)) continue;
      if (isOnCooldown(id)) continue;
      order.push(id);
      seen.add(id);
    }
  }

  // Advance the shared round-robin pointer
  rrPointer = (rrPointer + 1) % Math.max(freeModels.length, 1);

  // If literally every model is on cooldown, include the preferred model even
  // if it's cooling down — better to try and fail than to return an empty
  // rotation and 503 the caller.
  if (order.length === 0 && preferred) order.push(preferred);
  if (order.length === 0 && freeModels[0]) order.push(freeModels[0]);
  return order;
}

// Exported for tests / debug endpoints.
export function _resetRouterState(): void {
  cooldowns.clear();
  rrPointer = 0;
}
