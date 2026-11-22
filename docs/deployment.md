# Putting Glimpse online (Vercel)

The app and the engine deploy together on Vercel's free Hobby plan. The app becomes static pages, and the engine becomes one function (`api/index.js`). Vercel can't run Ollama or Laya, so online:
- the models come from a cloud API such as OpenRouter;
- the rules pick the animations.

## Steps

1. **Import the repo** at vercel.com (New Project → this GitHub repo). `vercel.json` already sets the install, the build (`web/`) and the function (60 s max). Or, from the repo folder: `npx vercel` then `npx vercel --prod`.
2. **A database:** Storage → Marketplace → **Neon** (free), connected to the project. It sets `DATABASE_URL`. Without it nothing is kept between requests.
3. **The models:** Settings → Environment Variables (the same names as in [configuration.md](configuration.md)):
   ```
   AI_BASE_URL   = https://openrouter.ai/api/v1
   AI_API_KEY    = <your OpenRouter key>
   OCR_MODEL     = google/gemini-2.5-flash-lite
   TUTOR_MODEL   = google/gemini-2.5-flash-lite
   AI_THINK_OFF  = {"reasoning":{"enabled":false}}
   ```
   Measured on OpenRouter (Nov 2026, test sheets): Gemini 2.5 Flash-Lite reads a whole sheet in about 0.9 s and answers as the tutor in about 1 s (the first hint in 0.5 s), for $0.10 / $0.40 per million tokens in / out; a whole-sheet check with "Help me" takes about 3.5 s. Also good: `anthropic/claude-haiku-5.5` as the tutor (about 2.5 s, stronger explanations, $0.10 / $0.50); `~z-ai/glm-flash-latest` is the cheapest ($0.05 / $0.07, about 1–2 s) but follows the latest GLM Flash, so it can change. Qwen 3.7 / 3.8 Flash took 3–4 s.
4. **Deploy**, then test it: `ENGINE=https://<your-app>.vercel.app npm run e2e`.

## Before real children use it

There is **no login**: anyone with the URL can read every student's history. Turn on Vercel's **Deployment Protection** (Settings → Deployment Protection), or put another login in front, before using real data.

## Limits of the Hobby plan

- It's for non-commercial use.
- A function runs up to 300 s (we use 60).
- A request body is at most 4.5 MB (a camera frame is 60–600 KB).
- Usage includes about 4 CPU-hours and 1M function calls a month; going over pauses the project.

Model calls are billed by the model provider: with the defaults above, about a cent for a few dozen turns.
