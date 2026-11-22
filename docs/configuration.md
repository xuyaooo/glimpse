# Settings

The engine reads environment variables, or a `.env.local` file in the repo folder (made by `./setup.sh`, never committed). Variables set in the shell win. Nothing is needed to run locally with Ollama.

## Models (`server/llm.js`)

Each role, `OCR` (reading the photo) and `TUTOR`, can use its own provider. `AI_*` is the default for both.

| Variable | What | Example |
|---|---|---|
| `AI_BASE_URL` | an OpenAI-compatible API; setting it switches from Ollama to the cloud | `https://openrouter.ai/api/v1` |
| `AI_API_KEY` | its key: server-side only, never sent to the browser | |
| `OCR_MODEL`, `TUTOR_MODEL` | the model ids at that provider | `qwen/qwen3.8-flash`, `anthropic/claude-haiku-5.5` |
| `AI_THINK_OFF` | JSON added to turn reasoning off (fast answers); each provider spells it differently | OpenRouter: `{"reasoning":{"enabled":false}}`; Groq/OpenAI: `{"reasoning_effort":"none"}` |
| `AI_EXTRA_BODY` | JSON added to every request | `{"provider":{"sort":"latency"}}` |
| `OCR_PROVIDER`, `TUTOR_PROVIDER` | `ollama` or `openai`, per role (e.g. local OCR + cloud tutor) | `OCR_PROVIDER=ollama` |
| `OCR_BASE_URL`, `OCR_API_KEY` (same for `TUTOR_`) | a different provider for one role | |
| `AI_TIMEOUT_MS`, `OCR_TIMEOUT_MS`, `TUTOR_TIMEOUT_MS` | how long one call may take before the student is asked to try again | default 120000 (45000 on Vercel) |
| `OLLAMA_URL` | where Ollama runs | `http://127.0.0.1:11434` |

`./setup.sh --local | --openrouter | --hybrid` writes the right set for you.

## Engine

| Variable | What | Default |
|---|---|---|
| `OCR_PORT` | the engine's port | `3001` |
| `HOST` | the address it listens on. `0.0.0.0` opens it to the network: there's no login | `127.0.0.1` |
| `DATABASE_URL` (or `POSTGRES_URL`) | Postgres (Neon on Vercel) | PGlite in `data/pglite` |
| `PGLITE_DIR` | where the local database lives | `data/pglite` |
| `DECIDE_URL` | Laya's service; empty = no Laya, the rules decide | `http://127.0.0.1:8091` |
| `DECIDE_PORT` | Laya's port when `npm run dev` starts it | `8091` |
| `ENGINE_DEBUG` | `0` stops saving each camera frame and its reading to `debug-frames/` (used to tune and to build OCR training data) | on locally, off on Vercel |

## App (web/)

| Variable | What | Default |
|---|---|---|
| `GLIMPSE_ENGINE` | where Vite sends `/api` in development | `http://localhost:3001` |
| `VITE_TUTOR_LANG` | the language Glim speaks (`en`, `fr`, `de`, `it`) | `en` |

The student's own settings are saved in the browser (Settings dialog, `localStorage` `glimpse.settings`):
- the voice on or off;
- natural (Kokoro) or system voice, which natural voice, and the speed;
- listening after pointing;
- the age that sets the animations' look;
- "Read when I lift my pencil".
