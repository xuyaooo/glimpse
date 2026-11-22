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
   OCR_MODEL     = qwen/qwen3.8-flash
   TUTOR_MODEL   = anthropic/claude-haiku-5.5
   AI_THINK_OFF  = {"reasoning":{"enabled":false}}
   ```
4. **Deploy**, then test it: `ENGINE=https://<your-app>.vercel.app npm run e2e`.

## Before real children use it

There is **no login**: anyone with the URL can read every student's history. Turn on Vercel's **Deployment Protection** (Settings → Deployment Protection), or put another login in front, before using real data.

## Limits of the Hobby plan

- It's for non-commercial use.
- A function runs up to 300 s (we use 60).
- A request body is at most 4.5 MB (a camera frame is 60–600 KB).
- Usage includes about 4 CPU-hours and 1M function calls a month; going over pauses the project.

Model calls are billed by the model provider: with the defaults above, about a cent for a few dozen turns.
