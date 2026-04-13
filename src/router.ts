// Rotation + cooldown bookkeeping.
//
// v0.1 keeps this in-memory on the Worker isolate. That means:
//   * different isolates have independent cooldown maps
//   * cooldowns vanish when an isolate is recycled
//
// Both are fine for "vibe coding" traffic patterns. v0.2 will move this to
// Cloudflare KV (or a Durable Object) so cooldowns are truly global.

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
//  1. If the caller specified a model, try it first (unless it's on cooldown).
//  2. Then round-robin through the remaining free models, skipping cooldowns.
// We advance `rrPointer` once per request so concurrent traffic spreads out.
export function buildRotation(
  freeModels: string[],
  preferred?: string,
): string[] {
  const order: string[] = [];
  const seen = new Set<string>();

  if (preferred && !isOnCooldown(preferred)) {
    order.push(preferred);
    seen.add(preferred);
  }

  if (freeModels.length === 0) return order;

  const n = freeModels.length;
  const start = rrPointer % n;
  rrPointer = (rrPointer + 1) % n;

  for (let i = 0; i < n; i++) {
    const id = freeModels[(start + i) % n]!;
    if (seen.has(id)) continue;
    if (isOnCooldown(id)) continue;
    order.push(id);
    seen.add(id);
  }

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
