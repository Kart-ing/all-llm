# always-llm

**OpenAI-compatible API that never 429s. Bring your OpenRouter key, rotate across every free model automatically — with smart task-based routing.**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Kart-ing/all-llm)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Kart-ing/all-llm)

---

always-llm is a tiny proxy that speaks the OpenAI Chat Completions API and forwards your traffic to OpenRouter. When a free model rate-limits you (402 / 429 / 5xx), it transparently falls through to the next free model — so your IDE, agent, or SDK never has to see a failure.

**New in v0.1:** Smart task-based routing. always-llm detects whether you're coding, reasoning, or writing creatively, and picks the best free model for the job before cascading to the rest.

Built for vibe coders who want to stay in flow and never pay a cent.

## 60-second quickstart

```bash
git clone https://github.com/Kart-ing/all-llm always-llm
cd always-llm
npm install

# One-time: stash your OpenRouter key as a Worker secret.
npx wrangler secret put OPENROUTER_API_KEY   # paste sk-or-...

# Ship it.
npx wrangler deploy
```

You now have a URL like `https://always-llm.yourname.workers.dev`. Point any OpenAI-compatible client at `/v1` and you're done.

## Use it with the OpenAI SDK

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,          // your sk-or-... key
  baseURL: "https://always-llm.yourname.workers.dev/v1",
});

const res = await client.chat.completions.create({
  model: "meta-llama/llama-3.3-70b-instruct:free",
  messages: [{ role: "user", content: "hello" }],
});

console.log(res.choices[0].message.content);
```

That's it. If Llama 3.3 is rate-limited, always-llm will quietly hand you a DeepSeek R1 response instead. The `x-always-llm-model` response header tells you which model actually served the request.

## Smart task-based routing

always-llm doesn't just round-robin blindly. It detects what you're trying to do and picks the right free model first:

| Task | What triggers it | Preferred models |
|---|---|---|
| **Coding** | Code blocks, programming keywords, system prompts with code context | Qwen Coder, DeepSeek V3, CodeStral |
| **Reasoning** | "step by step", math, logic, "analyze" | DeepSeek R1, QwQ |
| **Creative** | "write a story", fiction, roleplay | Creative-tuned models |
| **General** | Everything else | All free models equally |

### How task detection works

1. **Auto-detect** (default): always-llm scans your system prompt and last user messages for task signals. Code blocks and programming keywords score toward "coding", math/logic terms score toward "reasoning", etc. Needs a clear signal (score > 1) to override the default.

2. **Explicit header**: Send `x-always-llm-task: coding` to force a task category.

3. **Model prefix**: Prefix your model name: `coding:meta-llama/llama-3.3-70b-instruct:free`. The prefix is stripped before forwarding to OpenRouter.

### Rotation order with tasks

```
Your preferred model → Task-matched models → All other free models
         ↓                     ↓                      ↓
   (if rate-limited)    (if all rate-limited)   (last resort cascade)
```

The `x-always-llm-task` response header confirms what task was detected.

## How rotation works

1. On boot (cached 1 hour), always-llm calls `GET https://openrouter.ai/api/v1/models` and keeps only models where `pricing.prompt == "0"` AND `pricing.completion == "0"`.
2. For each incoming request it detects the task category, then builds a rotation order: your preferred model first, then task-matched models, then everything else — skipping any models on cooldown.
3. On a retryable failure (`402` / `429` / `502` / `503` / `504`), the model goes on a 60-second cooldown and we try the next one. Non-retryable errors (`400`, `401`) are returned to you untouched.
4. For streaming requests we **only rotate on the initial HTTP status**. Once SSE bytes start flowing we can't safely switch mid-stream — the client has already committed to a conversation.

## Why not just use OpenRouter directly?

| Feature | **always-llm** | Raw OpenRouter | [Mirrowel/LLM-API-Key-Proxy](https://github.com/Mirrowel/LLM-API-Key-Proxy) |
|---|---|---|---|
| Auto-rotation on 429 | ✅ | ❌ (you handle it) | ✅ |
| Task-based smart routing | ✅ | ❌ | ❌ |
| One-click deploy | ✅ Workers + Vercel | — | ❌ self-host Docker |
| OpenAI-SDK compatible | ✅ | ✅ | ✅ |
| Multi-provider | ❌ (OpenRouter only) | ✅ (one API, many providers) | ✅ Gemini / OpenAI / Anthropic |
| Setup time | ~60 seconds | ~5 minutes | ~30 minutes |
| Config surface | zero | zero | YAML + keys per provider |

**Pick always-llm if** you already have an OpenRouter key and you just want the 429s to stop and the right model for each task.
**Pick Mirrowel** if you want to juggle keys across multiple providers.
**Pick raw OpenRouter** if you want to handle rotation yourself.

## Works with

- ✅ **Claude Code** — see [`examples/claude-code.md`](examples/claude-code.md)
- ✅ **Cursor** — see [`examples/cursor.md`](examples/cursor.md)
- ✅ **Cline** — see [`examples/cline.md`](examples/cline.md)
- ✅ **Continue.dev** — config snippet in the Cline guide
- ✅ **Vercel AI SDK** — drop-in via `@ai-sdk/openai` with custom `baseURL`
- ✅ **OpenAI SDK** (JS, Python, anything)
- ✅ Any OpenAI-compatible HTTP client — plain cURL works too

## Local dev

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars, add your OPENROUTER_API_KEY

npm run dev        # wrangler dev on :8787
npm run build      # tsc --noEmit
```

## API reference

### `POST /v1/chat/completions`

Identical to OpenAI's endpoint. The `model` field is a *preference*, not a requirement — rotation may substitute a different free model.

**Response headers:**
- `x-always-llm-model` — which model actually served the request
- `x-always-llm-task` — the detected task category (`coding`, `reasoning`, `creative`, `general`)

**Custom request headers:**
- `x-always-llm-task` — force a task category (overrides auto-detection)

**Model prefix syntax:**
- `coding:model-id` — force coding task, strip prefix before forwarding
- `reasoning:model-id` — force reasoning task
- `creative:model-id` — force creative task

### `GET /v1/models`

Returns the current list of free OpenRouter models the proxy will rotate through.

### Authentication

Send your OpenRouter key as `Authorization: Bearer sk-or-...`, or set `OPENROUTER_API_KEY` as a Worker secret and it'll be used automatically for any unauthenticated request.

## Roadmap

- **v0.1.0**: in-memory cooldown, basic round-robin rotation.
- **v0.1.1** (you are here): task-based smart routing (coding, reasoning, creative), Claude Code integration.
- **v0.2**: Cloudflare KV-backed cooldowns (shared across isolates).
- **v0.3**: per-model latency tracking, prefer-fastest routing.
- **v0.4** (maybe): bring-your-own-provider (Gemini direct, Groq).

## License

MIT. See [LICENSE](LICENSE).
