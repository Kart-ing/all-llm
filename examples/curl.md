# cURL examples

Replace `YOUR_DEPLOY` with your Worker URL (e.g. `https://always-llm.yourname.workers.dev`).

## Non-streaming

```bash
curl -sS https://YOUR_DEPLOY/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/llama-3.3-70b-instruct:free",
    "messages": [{"role": "user", "content": "hi"}]
  }'
```

## Streaming

```bash
curl -N https://YOUR_DEPLOY/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek/deepseek-r1:free",
    "messages": [{"role": "user", "content": "count to 5"}],
    "stream": true
  }'
```

## List available free models

```bash
curl -sS https://YOUR_DEPLOY/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

## Inspect which model served your request

```bash
curl -i https://YOUR_DEPLOY/v1/chat/completions ... | grep -i x-always-llm-model
```
