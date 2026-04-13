// Vercel Edge Functions entrypoint. Re-exports the Hono app from src/.
// Vercel's edge runtime is Web-standard (Fetch / Streams), so the same app
// that runs on Cloudflare Workers runs here unchanged.
import { handle } from "hono/vercel";
import app from "../src/index.js";

export const config = { runtime: "edge" };

export default handle(app);
