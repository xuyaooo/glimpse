# Backend API

## Glimpse engine (main app)

Glimpse's protocol (`docs/protocol.md`, shapes in `web/src/lib/types.ts`) over HTTP, so it runs as a Vercel Function:

| Route | What |
|---|---|
| `GET /api/engine/hello` | `{ type: "hello", version, camera: false, store }`. Glimpse checks this to go live. `store` is `neon`, `pglite`, `pglite-memory` or `unavailable` (the last connection failed). It answers at once: on a cold start the database is set up in the background. |
| `POST /api/engine` `{ sessionId, event }` | `event` is one Glimpse client event (`session_start`, `cut_part` with the frame, `part_typed`, `confirm_reply`, `pick_exercise`, `ask_start`, `ask_end`, `question_typed`, `session_end`). The response is an **NDJSON stream** of engine events (`status`, `part`, `confirm`, `teach`, `exercises`, `profile`, `hint`, `question`, `answer`), in order. The session state is loaded from the database before the event and saved after it. Errors (JSON `{ error }`): **400** for a bad `sessionId` or `event` (text fields such as `student`, `name`, `lang`, `text`, `image` must be strings; `text` at most 1000 characters; `lang` a code like `en`), **409** for `session_start` on a `sessionId` that already exists (a session is never restarted or moved to another student), **400** / **413** for a body that isn't JSON or is over 5 MB. |
| `GET /api/students`, `GET /api/students/:id` | Dashboard summaries (`StudentSummary`, `web/src/lib/mock.ts`) built from stored sessions (each student's 50 newest). |
| `GET /api/history?student=&kinds=&limit=&before=&beforeRef=` | Saved records, newest first: `[{ ref, sessionId, studentId, kind, at, data }]`. `student`: one id (repeating it is a 400). `kinds`: `line,question` or `kinds=line&kinds=question`. `limit`: 1–500 (default 100). Next page: `before` = the last record's `at` and `beforeRef` = its `ref`. |
| `GET /api/history/sessions/:id` | Everything recorded in one session, in order. |
| `GET /api/review?student=` | Practise again: per finished session, newest first, `[{ ref, sessionId, at, title, items: [{ id, exercise, level, why, kind, answer, scene, done? }] }]`. Sessions that ended before suggestions existed get them on first call (made from their saved lines, then kept). See [practise-again.md](practise-again.md). |
| `POST /api/review/done` `{ ref, id, done }` | "I did it" on one suggested exercise (saved with its session). 400 on a bad body, 404 for an unknown exercise. |
| `GET /api/scene?text=&age=` | The animation Laya and the rules pick for a text (maths, reading or science), as the app would play it. Used by the Animations page and the tests. |

There is no login: anyone who can reach these routes can read every student's records (see README, "No login").

Engine rules:
- **Fractions are never reduced.** A diagnosis only counts when a known misconception reproduces the child's **exact** answer.
- **Every number in a scene is computed.** The model only answers free questions.
- **The teaching style switches** from pictures to fraction bars to a worked example when one didn't work, and tries first the style that worked for this child before.
- **The reader:**
  - finds the paper (or uses Glimpse's sheet frame) and flattens it;
  - finds the lines, keeping a stacked fraction as one line;
  - reads the lowest line not read yet, and returns its outline on the video as `box`.
  - When the line doesn't parse as checkable maths, it asks the child to confirm (`confirm`).

---

## Lab routes (older page, `npm run dev:lab`)

Everything runs locally: an Express server (`server/`) on port **3001** talks to Ollama. The page's Vite dev server (port 5173) forwards `/api/*` to it. A ready-made browser client is in [`src/api.js`](src/api.js), and it doesn't depend on any framework.

| Model | Used for | Default (env var) |
|---|---|---|
| GLM-OCR (0.9B) | Reading handwriting and print, math as LaTeX | `glm-ocr` (`OCR_MODEL`) |
| Qwen3.5 (9B, vision + thinking) | Tutor: hints, checking work, solutions | `qwen3.5` (`TUTOR_MODEL`) |

Images are sent as data URLs (`data:image/jpeg;base64,...`). `/api/exercise` needs JPEG.

---

## `GET /api/health`

```json
{
  "ok": true, "ollama": true,
  "ocr":   { "model": "glm-ocr", "ready": true },
  "tutor": { "model": "qwen3.5", "ready": true, "capabilities": ["completion", "vision", "tools", "thinking"] }
}
```

## `POST /api/ocr`: read an image

Request: `{ "image": "data:image/jpeg;base64,...", "mode": "auto" | "math" }`

- `auto` (default): text, with math as inline LaTeX, e.g. `Solve: $2x+5=11$`
- `math`: the whole image as one LaTeX block (`$$\begin{array}{l} … \end{array}$$`)

Response: `{ "text": "...", "ms": 513, "mode": "auto" }`

## `POST /api/exercise`: find and read the exercise someone points at

Request:

```json
{ "page": "data:image/jpeg;base64,...", "point": { "x": 0.31, "y": 0.27 }, "read": true }
```

- `page`: the **flattened** page (perspective-corrected, ideally without the hand on it).
- `point`: where the finger points, normalized from 0 to 1 on that page.
- `read: false` skips OCR and only returns the location.

What it does:
1. Finds blocks of writing (ink → lines → blocks split by blank lines; `src/lib/layout.js`).
2. Picks the block at the finger. Blocks above or beside the fingertip are preferred, because people point just below or next to what they mean.
3. Crops it at full resolution and reads it with GLM-OCR.

Response:

```json
{
  "found": true,
  "box": { "x0": 0.05, "y0": 0.24, "x1": 0.41, "y1": 0.34 },
  "blocks": [{ "x0": 0.07, "y0": 0.07, "x1": 0.33, "y1": 0.13, "lines": 2 }],
  "image": "data:image/jpeg;base64,...",
  "text": "2) Factor and solve:\nx²-5x+6=0",
  "ms": 204
}
```

`found: false` means no writing was near the finger, so a horizontal band of the page around the point was used. `box` and `blocks` are normalized to the page.

## `POST /api/tutor`: hints, checking, solutions, questions

Request:

```json
{
  "action": "hint" | "check" | "solve" | "ask",
  "exercise": { "text": "2) Factor and solve: x²-5x+6=0", "image": "data:image/jpeg;base64,... (optional)" },
  "work": "student's work so far (e.g. the latest page transcription)",
  "question": "required for ask",
  "history": [{ "role": "user" | "assistant", "content": "..." }],
  "think": true,
  "model": "inkling-2-mini",
  "sendImage": false,
  "stream": true
}
```

| action | Behavior |
|---|---|
| `hint` | One short hint for the next step. Never the answer. |
| `check` | Starts with `✅ Correct` if the work is complete and right. Otherwise it names the **first mistake** (quoting the step), says why it's wrong, and suggests the next step. |
| `solve` | Numbered worked solution, ending in `$\boxed{…}$`. |
| `ask` | Answers the student's question without giving the answer away. |

- `model` (optional): one of `TUTOR_MODELS` (default `inkling-2-mini,qwen3.5` plus `TUTOR_MODEL`). `/api/health` lists them under `tutor.models`, with `ready` and `capabilities`.
- `sendImage` (optional): `false` gives the model only the GLM-OCR text. That's faster, with no image processing. The server default comes from `TUTOR_IMAGE=auto|off`.
- `image` is passed to the model only if it can see images and `sendImage` isn't false.
- `history`: the last 6 user/assistant turns are kept; other roles are dropped.
- `think`: optional. By default the tutor thinks only for `solve`. `TUTOR_THINK=auto|on|off` changes the server default.
  - Measured with qwen3.5 9B on 7 right and wrong attempts: checking was **7/7 correct both ways**, taking about **2.7 s** without thinking vs **44 s** with it.
  - Hints start streaming after about 0.4 s.

**Streaming response** (default): newline-delimited JSON (`application/x-ndjson`), one event per line:

```
{"type":"meta","model":"qwen3.5","action":"check","think":false,"usedImage":true}
{"type":"thinking","text":"..."}          // only when thinking
{"type":"delta","text":"✅ Correct! You "}  // answer text, Markdown + LaTeX
{"type":"done","ms":2100,"evalCount":77,"totalMs":2050}
{"type":"error","error":"..."}            // instead of done, on failure
```

Closing the connection stops generation.

**Non-streaming** (`"stream": false`):

```json
{ "model": "qwen3.5", "action": "check", "think": false, "usedImage": true, "text": "...", "thinking": "", "ms": 2700 }
```

Errors: `400 { error }` for bad input; `503` if the tutor model isn't installed (the message includes the `ollama pull` command); `502` for Ollama failures.

## `POST /api/animate`: animation for young children

Request: `{ "exercise": { "text": "1/2 + 1/4" }, "model": "qwen3.5" (optional) }`

The **numbers are computed in code**, so the animation is always right:

| Exercise | Scene |
|---|---|
| Fractions (`1/2 + 1/4`, `\frac{2}{3} - \frac{1}{3}`) | 🍫 Chocolate bar(s) in equal pieces (common denominator, max 12 per bar, max 3 bars). "add" lights pieces up, "take" eats them. |
| Small whole numbers (result 0–20) | 🍎 Objects (apple, cookie, star, …) appear or fly away. |
| Other whole numbers (range up to 30) | 🐸 A frog hops on a number line. |

The tutor model only writes the words (title, object, one sentence per step), as structured JSON. For word problems it can't parse ("Tom has 5 cookies and eats 2"), the model proposes the plan and the server checks that the steps add up.

Response (2–5 s with qwen3.5):

```json
{
  "verified": "exact",
  "model": "qwen3.5",
  "ms": 2100,
  "recipe": {
    "scene": "chocolate", "object": "chocolate", "title": "Chocolate Fun!",
    "whole": 4, "bars": 1, "start": 2, "startLabel": "1/2", "startSay": "We have one half of a chocolate bar.",
    "steps": [{ "op": "add", "amount": 1, "label": "+ 1/4", "say": "Now add one quarter more to our treat." }],
    "result": { "value": 3, "label": "3/4", "say": "Look! We have three quarters all together now." }
  }
}
```

- `verified` is `"exact"` when the numbers come from the exercise, and `"consistent"` when they come from the model's plan, checked to add up.
- `422 { error }` means it can't be animated correctly (e.g. `1/7 + 1/9` would need 63 pieces).
- `number_line` recipes also have `min` and `max`.
- The page player is `src/components/KidAnimation.vue`. It reads `say` aloud with the browser's speech (local voices on macOS).

---

## What runs in the browser (and why)

These run in real time on every camera frame (about 10 per second), so they stay client-side, in `src/composables/useWritingDetector.js` and `src/lib/`:

| Part | Code |
|---|---|
| Paper detection | `src/lib/paperDetect.js`: edges, lines and scoring; works on white tables; ignores hands |
| Flattening and geometry | `src/lib/paper.js` |
| Hand tracking | MediaPipe, `src/lib/handTracker.js` |
| Pointing gesture | `src/lib/gesture.js`: index straight, other fingers curled, thumb away from index |
| Stop-writing detection | `useWritingDetector.js` |
| Hand-free page capture | `capturePage()`: the last frame with no hand, so the pointing hand doesn't cover the exercise |

A new frontend only needs:
- `useWritingDetector()`, for its events `onStopWriting` and `onPoint(pagePoint)` and its functions `captureSnapshot()` and `capturePage()`;
- `src/api.js`.
