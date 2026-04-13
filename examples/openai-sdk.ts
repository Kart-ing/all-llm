// Run with: OPENROUTER_API_KEY=sk-or-... npx tsx examples/openai-sdk.ts
//
// Demonstrates that always-llm is a drop-in replacement for the OpenAI SDK.
// Point `baseURL` at your deployed Worker and you're done.

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "missing",
  baseURL: process.env.ALWAYS_LLM_URL ?? "https://always-llm.example.workers.dev/v1",
});

async function nonStreaming() {
  const res = await client.chat.completions.create({
    // Pass any model — if it's rate-limited, always-llm rotates for you.
    model: "meta-llama/llama-3.3-70b-instruct:free",
    messages: [{ role: "user", content: "One-sentence haiku about retries." }],
  });
  console.log("non-streaming:", res.choices[0]?.message?.content);
}

async function streaming() {
  const stream = await client.chat.completions.create({
    model: "deepseek/deepseek-r1:free",
    messages: [{ role: "user", content: "Count from 1 to 5." }],
    stream: true,
  });
  process.stdout.write("streaming: ");
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
  }
  process.stdout.write("\n");
}

await nonStreaming();
await streaming();
