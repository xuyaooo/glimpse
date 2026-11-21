# Glimpse

A webcam tutor that watches a child solve maths on paper, finds the misconception behind a mistake, and explains it with a picture and a spoken hint in the child's own language.

LauzHack 2026, for the Logitech, AXA, IMC and Scholé challenges. Full spec: [docs/spec.md](docs/spec.md).

## What's in the repo

| Folder | What | Stack |
|---|---|---|
| `web/` | Everything people see: the child's desk screens and the teacher area | Vue 3, Tailwind CSS v4, Vite (Node.js), TypeScript |
| `engine/` | Camera, handwriting reading, step checking, misconception library | Python, FastAPI, WebSocket |
| `docs/` | Spec, [navigation map](docs/navigation.md), [web ↔ engine protocol](docs/protocol.md) | |

The vision, maths and speech parts stay in Python because OpenCV, MediaPipe, SymPy and Whisper are Python. The web app is the only thing the child and the teacher touch.

## Run it

**Frontend only (demo mode).** Needs Node 20 or 22 (Vite 6 warns on Node 21 but works).

```sh
cd web
npm install
npm run dev          # http://localhost:5173
```

With no engine running, the app switches to **demo mode** after 1.5 s: a scripted engine replays the fractions story, so you can build screens without a camera. It's also the backup for the stage demo. Force it with `http://localhost:5173/?demo`.

On the Desk screen: **C** or **Space** means "the child finished a line", and **holding A** means "ask a question". The on-screen buttons do the same. The script goes:
1 right, 2 wrong ("adds across", circled, pie comparison, French hint), hold A to ask about the 6, 3 right (the idea clicked), 4 right, 5 the reader is unsure and asks the child to confirm, 6 right, then Finish.

**With the engine**

```sh
cd engine
uv sync                                                    # add --extra vision / math / speech as needed
uv run uvicorn glimpse_engine.server:app --reload --port 8000
uv run pytest                                              # checker, bug library, WebSocket flow
```

Then `npm run dev` in `web/`. Vite proxies `/ws`, `/api` and `/video.mjpg` to the engine, so the browser only ever talks to `localhost:5173`. Until the camera pipeline exists, the engine reports `camera: false` and the app draws the worksheet instead of video. Send `{"type": "check_typed", "problem": 2, "answer": "4/6"}` over `/ws` to drive the real checker.

## MX Master 4 buttons (Logi Options+)

Map the buttons to plain keystrokes, scoped to the browser:

| Button | Keystroke | Meaning |
|---|---|---|
| Thumb button | `C` | Check my line |
| Gesture or side button | `A`, held | Ask a question while held |

If Options+ only sends a quick tap rather than holding the key, a short press starts listening and the next press stops it (see `web/src/lib/keys.ts`).

## Design

The screens were designed first in Claude Design (canvas: https://claude.ai/artifact/3M5dJHT4xMTW8FvAHYqx3f, private until shared from its Share menu). Tokens live in `web/src/style.css`:

- **The child's screens are a page of squared exercise-book paper** (`bg-squared`). The tutor draws its explanation straight onto it instead of putting it in a card.
- **Blue fountain-pen ink** `#2452CC` for ticks and actions, an **orange marker** `#E8620F` for mistakes (never red), graphite `#12141A` for text.
- **Andika** for all text: SIL designed it for children learning to read, with single-storey a and g and distinct 1, l and I, in many scripts. **Kalam** only stands in for the child's handwriting in demo mode.
- One orchestrated motion: the orange circle draws itself around a mistake. Everything else is still. Reduced motion is respected.

## Navigation

See [docs/navigation.md](docs/navigation.md). In short, the child never sees a menu (Start → Setup → Desk → Summary), and adults get a top navigation under `/teacher`.
