# Use always-llm with Claude Code

Claude Code supports OpenAI-compatible API providers, so you can point it at always-llm to get free model access with automatic rotation.

## Setup

### 1. Configure the provider

Add an OpenAI-compatible provider in your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "apiProvider": "openai-compatible",
  "openaiBaseUrl": "https://always-llm.yourname.workers.dev/v1",
  "openaiApiKey": "sk-or-..."
}
```

Or set it via environment variables:

```bash
export OPENAI_BASE_URL="https://always-llm.yourname.workers.dev/v1"
export OPENAI_API_KEY="sk-or-..."
```

### 2. Pick a model

Use any free OpenRouter model ID. Good defaults for coding with Claude Code:

```bash
# Dedicated code models (always-llm auto-detects coding tasks too)
claude --model "qwen/qwen-2.5-coder-32b-instruct:free"

# Or just use any model — always-llm will route coding tasks
# to code-specialized models automatically
claude --model "meta-llama/llama-3.3-70b-instruct:free"
```

### 3. Use task prefixes (optional)

Force a task category by prefixing the model name:

```bash
# Force coding models
claude --model "coding:meta-llama/llama-3.3-70b-instruct:free"

# Force reasoning models  
claude --model "reasoning:meta-llama/llama-3.3-70b-instruct:free"
```

Or set the `x-always-llm-task` header if your setup supports custom headers.

## How it works with Claude Code

Claude Code sends coding-heavy prompts (system prompts with code context, user messages with code blocks, etc.). always-llm auto-detects this and routes to code-specialized models like:

- `qwen/qwen-2.5-coder-32b-instruct:free`
- `deepseek/deepseek-v3:free` (when available)

If those are rate-limited, it cascades to general-purpose models. You never see a 429.

## Tips

- **Check which model served you**: Look for the `x-always-llm-model` header in responses
- **Check detected task**: The `x-always-llm-task` header shows what task type was detected
- **Local dev**: Point at `http://localhost:8787/v1` if running `npm run dev`
