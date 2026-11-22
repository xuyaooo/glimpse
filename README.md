# Glimpse

A webcam maths tutor. A child (or an older student) writes maths on paper under the camera; Glimpse reads it, checks it, explains it out loud with a natural voice and an animation picked for the exercise and the student's age, answers questions asked by pointing at the paper, and suggests exercises to practise after each session.

LauzHack 2026, for the Logitech, AXA, IMC and Scholé challenges. Spec: [docs/spec.md](docs/spec.md).

## How it's used

- **Home** `/`: today's numbers, *Continue your practice* (opens the camera), *Choose a practice*.
- **Camera** `/scan`: write a line and lift your pencil: Glimpse reads the whole photo, checks the newest line and gives a hint; when it's wrong or unfinished, the worked solution and its animation are offered as a video on the camera. Point at the paper, hold still and ask out loud ("how do I solve this?"): the answer is spoken and the animation opens. *Finish* ends the session with a summary.
- **My work** `/work`: every line ever written, why it's right or not, the photo it was read from and its animation; progress, topics practised, mistakes to watch out for; and **Practise again**: 3 to 5 exercises suggested after each session (the ones that went wrong, the same with new numbers, a step further), with the answer and the animation, and "I did it".
- **History** `/history`, **Animations** `/animations` (every animation, with examples, by school level), **Settings** (voice on/off, natural or system voice, age, listening after pointing), **Tutor view** `/dashboard/:student`.

## What's in the repo

| Folder | What |
|---|---|
| `web/` | the app: Vue 3, Tailwind CSS v4, Vite, TypeScript, KaTeX. Hand tracking (MediaPipe), speech recognition (Whisper) and the natural voice (Kokoro) run in the browser. The animations are `web/src/components/scenes/`. |
| `server/` | the engine (Node, Express): reading, checking, teaching, the animation library, the database. Runs locally on :3001 or as one Vercel Function (`api/index.js`). |
| `decide/` | Laya, the small decision model (421M, Apache-2.0) that picks which animation fits an exercise, as a local service on :8091. Optional: without it the engine's rules decide. |
| `test/`, `scripts/` | unit tests, the end-to-end tests on real photos, benchmarks. |
| `docs/` | spec, navigation, [the protocol between the app and the engine](docs/protocol.md). [API.md](API.md): the engine's HTTP routes. |
| `engine/` | the first Python prototype (fractions checker, misconception library), kept for reference; the Node engine in `server/` replaces it. |

```
browser: web/ (Vue)  ── camera, pencil lift, hand tracking, speech (Whisper), voice (Kokoro), animations
   │  POST /api/engine {sessionId, event}  ← NDJSON stream of engine events (docs/protocol.md)
   ▼
engine: server/app.js (Express) ── one Vercel Function (api/index.js) or a local server (:3001)
   ├─ server/engine/reader.js   the whole photo -> OCR model (GLM-OCR; never cropped)
   ├─ server/engine/session.js  photo + OCR text -> tutor model: verdicts, hints, answers, worked steps,
   │                            session summary; the protocol as a pure step function over JSON state
   ├─ server/engine/scenes.js   the animation library: rules read the maths, every number is computed
   ├─ server/engine/review.js   exercises to practise after a session, answers worked out by code
   ├─ server/engine/maths.js    exact fractions, misconception library
   ├─ server/engine/teach.js    pies / bars / worked example per child, hints, similar exercises
   ├─ server/llm.js             models: local Ollama, or any OpenAI-compatible API (OpenRouter...)
   └─ server/store.js           Postgres (sessions + history): Neon on Vercel, PGlite locally (data/)
decide/laya_service.py   Laya: which animation fits, ~50 ms (:8091)
```

## Run it locally

Needs Node 20+, and either [Ollama](https://ollama.com) (models on your computer) or an API key for a cloud provider such as OpenRouter. Python 3.10+ for Laya (optional).

```bash
ollama pull glm-ocr && ollama pull qwen3.5   # once: the OCR and tutor models
npm run setup                                # once: installs the engine and the app
npm run setup:decide                         # once: the Laya decision model (optional)
npm run dev                                  # engine :3001 + app http://localhost:5173 + Laya :8091
```

- The app finds the engine by itself (`/api/engine/hello`). Without one it runs a scripted demo (`?demo`).
- Settings (cloud models, database...) go in `.env.local` in this folder (copy `.env.example`). The engine reads it when it starts; variables set in the shell win.
- The engine listens on this computer only (`127.0.0.1:3001`). `HOST=0.0.0.0` opens it to the network, but read "No login" first.
- The first visit downloads the natural voice (Kokoro) and Whisper into the browser (once, then cached).

## Test it

```bash
npm test                 # unit tests
npm run sweep            # every animation on 52 edge cases
npm run e2e              # the whole pipeline on real photos (test/fixtures), with npm run dev running
npm run e2e:failures     # what the child sees when a model or the network fails
decide/.venv/bin/python decide/eval.py   # how well Laya picks animations on unseen exercises
```

`ENGINE=https://... npm run e2e` tests another engine (e.g. a Vercel deploy).

By hand, at http://localhost:5173 (pick a child, open the camera):
1. Write `3x + 5 = 20` and lift your pencil: a hint, then the balance animation.
2. Point at an exercise, hold still, ask out loud: the answer is spoken and the animation opens.
3. Settings (gear): set Age to 6 and write `3 + 4 =`: objects to count. Turn the voice or the listening off.
4. Finish: the session summary and the exercises to practise; then My work → Practise again.

## No login

There are no accounts or passwords. Anyone who can reach the engine can read **every** student's history (names, photos of their paper, questions, summaries) through `/api/history` and `/api/students`. Locally this is why the engine only listens on `127.0.0.1`. A public deploy is open to anyone with its URL: don't use it with real children's data without access control in front of it (for example Vercel's Deployment Protection).

## Deploy on Vercel (free Hobby plan)

1. **Import** this repository in Vercel. `vercel.json` sets the build: `web/` becomes the static site and `api/index.js` the function (60 s max). Or from this folder: `npx vercel --prod`.
2. **Storage → Marketplace → Neon (free)**, connected to the project: it sets `DATABASE_URL`. Without it nothing is kept between requests.
3. **Settings → Environment Variables**: Ollama only runs on your computer, so Vercel needs a cloud API (see `.env.example`): `AI_BASE_URL`, `AI_API_KEY`, `OCR_MODEL` (a vision model that reads handwriting), `TUTOR_MODEL`, `AI_THINK_OFF`. On Vercel, Laya isn't there and the rules pick the animations.
4. Deploy.

The Hobby plan is for non-commercial use: functions up to 300 s (we use 60), request bodies up to 4.5 MB (a camera frame is 60–600 KB), about 4 CPU-hours and 1M function calls a month. Model calls are billed by the model provider.

## Design

Follows the team's reference images (`home.jpg` for Home, `design.jpg` for the rest): a sunny Swiss study desk. Tokens live in `web/src/style.css`:

- Sky background with drifting clouds, Alps and pine forests behind the greeting on Home, a deep-blue sidebar ending in mountains with a Swiss flag and the child's level, white cards. Glim, the lens mascot, blinks and waves.
- Lagoon teal `#0F7F76` for actions, navy `#18294A` text, sunflower for stars and sticky notes. Right and not-yet always come with an icon and a word, never colour alone.
- Nunito for the interface. Two handwritings with two jobs: Caveat is the tutor's blue marker on the whiteboard, Kalam is the child's pencil in what the camera sees. KaTeX typesets what the reader read.
- Motion: cards rise in on load; the scan beam sweeps over the line being read; read lines type themselves in; verdicts pop, with confetti for a right answer; the whiteboard draws its explanation stroke by stroke; numbers count up. All of it switches off with reduced motion.

An earlier eight-screen draft lives in Claude Design (https://claude.ai/artifact/3M5dJHT4xMTW8FvAHYqx3f, private until shared); the code no longer follows it.
