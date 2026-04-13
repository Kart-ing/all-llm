# Use always-llm with Cline

Cline (the VS Code extension formerly known as Claude Dev) supports OpenAI-compatible endpoints.

1. Open the Cline sidebar and click the **settings gear**.
2. Set **API Provider** to **OpenAI Compatible**.
3. **Base URL**: `https://always-llm.yourname.workers.dev/v1`
4. **API Key**: your OpenRouter key (`sk-or-...`)
5. **Model ID**: any free model, e.g. `deepseek/deepseek-r1:free`

Save. Cline will send requests through always-llm, which rotates to the next free model whenever yours hits a 429.

## Continue.dev

Same idea — in `~/.continue/config.json`:

```json
{
  "models": [
    {
      "title": "always-llm",
      "provider": "openai",
      "model": "meta-llama/llama-3.3-70b-instruct:free",
      "apiBase": "https://always-llm.yourname.workers.dev/v1",
      "apiKey": "sk-or-..."
    }
  ]
}
```
