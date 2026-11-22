# How Glimpse works

```
browser (web/, Vue 3)
  camera ─ pencil lift / "Read my line now" ─────┐   hand tracking (MediaPipe): pointing + holding still
  microphone ─ Whisper (in the browser) ─────────┤   natural voice (Kokoro, in the browser) reads Glim's words
                                                 ▼
  POST /api/engine { sessionId, event }   ← answers as a stream of events (NDJSON), docs/protocol.md
                                                 │
engine (server/, Node + Express) ── a local server on :3001, or one Vercel Function (api/index.js)
  session.js   the protocol as a step function: (saved state, event) -> events + new state
   ├─ reader.js     the WHOLE photo -> the OCR model (GLM-OCR): the page's lines (never cropped)
   ├─ tutor model   photo + OCR text (+ the spoken question) -> verdicts, hints, answers, worked steps
   ├─ maths.js      exact fraction checking and the misconception library (adds the tops and the bottoms...)
   ├─ teach.js      pictures / bars / worked example, chosen per child; similar exercises
   ├─ scenes.js     the 25 maths animations: parsed and computed in code   ◄── Laya (decide/, :8091) picks the kind
   ├─ domains.js    the 11 reading and science animations (syllables, spelling, units, circuits...)
   ├─ review.js     after the session: exercises to practise again, answers computed in code
   └─ store.js      Postgres: the session state + the history (PGlite locally in data/, Neon on Vercel)
  llm.js       the models: Ollama on this computer, or any OpenAI-compatible API (OpenRouter...), per role
```

## Subjects

The student picks Maths, Reading or Science on Home (*Choose a practice*), and the engine is told (`subject`). The same loop works for all three. The tutor's prompts follow the subject: hints about spelling and punctuation in reading, units and facts in science. Any written line counts as work, not only lines with maths. In Reading, a misspelt word gets its animation once the tutor has given the right spelling, so a misspelling is never taught as the answer.

## One line, from the pencil to the hint

1. **The pencil lifts.** The camera page notices the pause (or the student presses *Read my line now*, `W`, `C` or `Space`). It sends the whole frame: `{ type: "cut_part", image }`.
2. **The whole photo is read** (`reader.js`). GLM-OCR transcribes it, and the lines are cleaned (LaTeX, OCR slips such as `S` for `∫`). A new sheet of paper is detected, so lines from the old page aren't mixed in. The engine sends `page` (what was read).
3. **The newest line is judged** (`session.js` → `analyzePage`). The OCR text is the truth about *what* is written. The tutor model sees the photo and the text and says whether each line is right, not yet, unfinished or printed. Exact maths (fractions, sums) overrides the model when it can decide. The engine sends `part` events (verdicts) and a `hint`.
4. **It was wrong or unfinished**, so the full solution is prepared. Laya and the rules pick an **animation** (`scenes.js`), which is sent first and offered on the camera as a video. The tutor's **worked steps** follow (`steps`). Integrals and derivatives get a numerically checked antiderivative or derivative. When the tutor's result and the animation's disagree, the animation is dropped.
5. **Everything is remembered.** The state is saved after each event, and the history gets the line (with a small photo), the hint, the steps and the animation.

## Pointing and asking

The hand tracker sees a finger pointing and holding still for 1 s. It sends the frame with a red ring drawn at the fingertip, plus the question: what was heard (Whisper) or typed, or "Can you help me with this?". The engine reads the whole photo, and the tutor answers about the ringed exercise (`answer`). If it's maths, the solution and animation follow as in step 4.

## The end of a session

*Finish* (camera page) or *End session* (My work) sends `session_end`. The engine writes the **summary**:
- the stars, counted from effort and right answers;
- what was practised, every kind of maths seen;
- the mistakes, each with a tip;
- what to do next, and a note for grown-ups.

It also writes the [exercises to practise again](practise-again.md). The tutor model writes the words; the counts are code. If the model fails, a counted summary is used.

## Where things are saved

| Table | What |
|---|---|
| `glimpse_sessions` | each session's state (JSON): lines, verdicts, misconceptions, the teaching style that works, topics, age |
| `glimpse_history` | one record per thing that happened: `line`, `question`, `steps`, `summary` (with `review`), by student and session |

Locally it's PGlite in `data/pglite` (a real Postgres in a folder). On Vercel it's Neon (`DATABASE_URL`). There are no accounts: see "No login" in the [README](../README.md).

## Models

| Role | Default (local) | Cloud (`./setup.sh --openrouter`) | Notes |
|---|---|---|---|
| Reading the photo | `glm-ocr` (Ollama) | `qwen/qwen3.8-flash` | the whole frame, every time |
| Tutor | `qwen3.5` (Ollama) | `anthropic/claude-haiku-5.5` | JSON outputs with schemas; reasoning off for speed |
| Which animation | Laya (421M, local service) | — (the rules decide) | optional |
| Speech to text | Whisper base.en (browser) | | WebGPU, else WASM |
| Voice | Kokoro-82M (browser), or the system voice | | can be turned off in Settings |

Why these: [research/fast-ai-models-for-live-tutoring.md](research/fast-ai-models-for-live-tutoring.md) and [research/handwriting-transcription-models.md](research/handwriting-transcription-models.md). Making them better at our job: [models/README.md](../models/README.md).
