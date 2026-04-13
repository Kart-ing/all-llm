# Use always-llm with Cursor

Cursor supports any OpenAI-compatible endpoint.

1. Open **Cursor Settings → Models**.
2. Scroll down to **OpenAI API Key**, click **Override OpenAI Base URL**.
3. Paste your deployed URL with `/v1` appended:

   ```
   https://always-llm.yourname.workers.dev/v1
   ```

4. In the **OpenAI API Key** field, paste your OpenRouter key (`sk-or-...`).
5. Click **Verify**. Cursor will hit `/v1/models` — you'll see the free-model list.
6. Add a custom model name (e.g. `meta-llama/llama-3.3-70b-instruct:free`) and enable it.

You're set. When a free model rate-limits, always-llm transparently rotates to the next one.
