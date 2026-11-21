# Glimpse: Technical Specification (v2)

> A webcam tutor that watches a child write maths on paper, shows on screen what it read, checks it, and when it's wrong, teaches it visually in the way that works for that child and hands over a similar exercise.

LauzHack 2026 · Target challenges: **Logitech · AXA · IMC · Scholé** (+ main ranking) · Hacking ends **Sunday 12:00** (24 h, not 48).

v2 replaces v1's screen-by-screen UX with the flow below. v1 is in git history (`docs/spec.md`, commit e6f9691).

---

## 1. How it works

Two pages. Everything the child does happens on the first.

| Page | Route | Who | What it shows |
|---|---|---|---|
| **Session** | `/` | the child (a tutor picks the child once) | the live paper, what the child wrote, whether it's right, the visual teaching, similar exercises, answers to pointed questions |
| **Tutor dashboard** | `/dashboard/:student` | tutor, teacher, parent, NGO | a summary of each student |

```
Session (/)  ──── "Tutor dashboard" / "End session" ────▶  Dashboard (/dashboard/:student)
   ▲  first open: "Who's writing today?"                       │  student list → that student's summary
   └──────────────────────── "Back to the session" ────────────┘
```

### 1.1 Loop 1: write → read → check → teach

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                      │
 ▼                                                                                      │
CAPTURE ──▶ PART FINISHED ──▶ READ ──▶ SHOW WHAT YOU WROTE ──▶ CHECK                     │
camera on   pencil lifted,    OCR to   typeset on screen,      by code, not by          │
the paper   ink stops         LaTeX    region lit on paper     a model's opinion        │
            changing                   (unsure → "Did you                               │
                                        write 4/6?")                                    │
                                                         ┌──────────┴──────────┐        │
                                                      correct                 wrong     │
                                                         │                      │       │
                                                    tick, move on     find the misconception
                                                                                │       │
                                                          ┌─────────────────────┴────┐  │
                                                          ▼                          ▼  │
                                              (a) TEACH IT VISUALLY      (b) RECOMMEND SIMILAR
                                                  style chosen from          EXERCISES that target
                                                  what works for this        the same misconception
                                                  child; a style that                │
                                                  failed is not repeated             │
                                                          └────────────┬─────────────┘
                                                                       ▼
                                                     child writes a similar exercise ──────┘
                                                     (right or wrong updates the child's teaching profile)
```

1. **Capture.** A Logitech MX Brio looks down at the paper. The child writes with a normal pencil on any paper (corner markers make it sturdier, see 4.1).
2. **Part finished.** A *part* is one line or step of working, or an answer. It is finished when the pencil lifts and the ink in that region stops changing for ~1.2 s while the hand is away from it. A manual trigger (key or mouse button) does the same, for demos and as a fallback.
3. **Read.** The part's crop is read into LaTeX with a confidence score.
4. **Show what you wrote.** The part appears on screen, typeset, in a running list next to the live image. Its region is outlined on the paper. If the reader is unsure, the child confirms with one tap ("Did you write 4/6?") before anything else happens, which is also cheaper than asking a big model.
5. **Check.** Exact arithmetic (SymPy for general expressions) decides right or wrong.
   - **Right:** a tick. If the child was working on a recommended exercise, the teaching that came before it counts as a success.
   - **Wrong:** find the misconception: a bug that reproduces the child's *exact* answer (4.5). Then do both:
     - **(a) Teach it visually, personalised.** Render an explanation in one style: pictures (pies), fraction bars, a worked example, or a number line. Pick the style from this child's teaching profile, never repeat a style that just failed for the same misconception, and phrase it in the child's language. Each iteration is new evidence about what works for this child (4.6).
     - **(b) Recommend similar exercises.** Two or three new problems on the same skill, chosen so the suspected bug would give a recognisably wrong answer. They're shown on screen and the child writes one on the paper, which goes back to step 2 (4.7).

### 1.2 Loop 2: point and ask (any time during capture)

1. The hand detector sees a **pointing finger** held still over the paper and the child starts speaking. A held key or mouse button does the same as a fallback.
2. Fingertip → page position → which part, and which symbol in it, is pointed at. It's highlighted on screen.
3. Speech → text, locally, in any language.
4. The model answers with structured context only (the pointed part, its verdict, the diagnosis, the question): one or two spoken sentences, with a visual when it helps. It never gives the final answer, which is checked by code before speaking.

### 1.3 After the session: the tutor dashboard

A separate page. "End session" opens it for that student.

- **Student list:** everyone, with today's accuracy and who needs attention.
- **Student summary:** a written summary at the top; what the student wrote (typeset, ticked or circled, with times); misconceptions found and whether they're fixed; **what teaching works for this student** (success rate per style); the exercises we'd give next; the questions they asked and what they pointed at; sessions over time.
- **AI usage:** big-model calls and cost for the session (evidence for AXA).

---

## 2. Challenge mapping

| Challenge | What we deliver |
|---|---|
| **Logitech** | The webcam as the AI's eyes (paper capture, pencil-lift detection, pointing gesture) and the mic as its ears (questions). MX Brio 4K Show Mode. Optional MX Master: manual trigger, haptic "I read it" pulse |
| **AXA** | Text + image input. Frugal cascade: pencil-lift gate → crop → small local reader → big model only when unsure. Cost per hour against a naive "frame every 2 s to a big VLM" baseline, on the dashboard |
| **IMC** | Free, runs on a laptop, hints and answers in the child's language, a dashboard for schools and NGOs |
| **Scholé** | No chat window. Diagnoses the misconception instead of marking wrong, teaches visually, adapts the teaching style to the learner across iterations; the "click" is visible on screen and on the dashboard |

---

## 3. Hardware

| Device | Use |
|---|---|
| **MX Brio** | 4K for reading crops, 1080p/60 for hand tracking. Tilted down (Show Mode) or on an arm. Lock focus, exposure and white balance (Logi Tune / Options+). Beamforming mics for questions. Privacy shutter |
| **MX Master 4** (optional) | One button = "read this part now", one held = "I'm asking". Haptics via the Logitech Actions SDK if time allows |

The camera is a standard UVC webcam (`cv2.VideoCapture`); no Logitech SDK needed.

---

## 4. Architecture

```
                 ┌───────────────────────────── ENGINE (Python, FastAPI) ─────────────────────────────┐
 MX Brio video ─▶│ capture ─▶ parts ─▶ reader ─────────▶ reasoner ─▶ teacher ──┐                         │
                 │ rectify    pencil   small local       check +     style per  │                         │
                 │ the page   lift     OCR; big VLM      misconcep-  child      ├─▶ server ── WebSocket ──┼─▶ WEB (Vue)
                 │                     only if unsure    tion        exercises ─┘   + HTTP API            │   Session  /
 MX Brio mic ───▶│ pointing: hand landmarks + speech-to-text ─▶ answer ─────────────┘                      │   Dashboard /dashboard
                 │ records: every part, verdict, teaching outcome, question ──▶ /api/students ───────────┼─▶
                 └────────────────────────────────────────────────────────────────────────────────────────┘
 Fallback: big VLM / LLM via OpenRouter, only when a local step is unsure or fails its check. Logged with tokens and cost.
```

| Engine module | Job | Tech | Status |
|---|---|---|---|
| `capture` | camera, page rectification, MJPEG stream for the web | OpenCV, ArUco | to build |
| `parts` | pencil-lift detection, cut finished parts | OpenCV ink diff, MediaPipe hand mask | to build |
| `reader` | crop → LaTeX + confidence, escalation | small handwriting-maths model, big VLM fallback | to build |
| `reasoner` | right or wrong; misconception diagnosis | exact arithmetic, SymPy, bug library | to build; the v1 prototype in `engine/` has the fractions checker and bug library |
| `teacher` | pick a style per child, build the visual scene | rules + per-child success counts | to build |
| `exercises` | similar exercises for a misconception | generator + bug predictions | to build |
| `pointing` | pointing gesture → target; speech; answer | MediaPipe Hands, Whisper, small LLM | to build |
| `records` | student history, dashboard API | JSON file (SQLite later) | to build |
| `server` | WebSocket events + HTTP API | FastAPI | to build; the v1 prototype speaks the old protocol |

| Web page | Components | Status |
|---|---|---|
| Session `/` | live camera, what you wrote, teaching panel, similar exercises, question bar, student picker | built, runs on demo data |
| Dashboard `/dashboard/:student` | student list, student summary | built, runs on demo data |

The web app never decides whether an answer is right. It renders what the engine sends. With no engine running, a scripted demo engine in the browser replays the same events (stage backup).

### 4.1 Capture and rectify
- **The browser opens the camera** (`getUserMedia`; the MX Brio is a standard UVC webcam), shows it live with the tutor's drawings on top, notices the pencil lift itself, and sends the engine one frame per finished line (`cut_part` with `image`). The engine never needs the camera device.
- Any paper works; the printable sheet (`/worksheet`) puts the lines where the on-screen frame expects them. With 4 ArUco markers printed in the corners (`DICT_4X4_50`), each frame is warped to a flat page (`findHomography`, `warpPerspective`); the last good homography is kept while the hand covers a marker.
- ~5 fps processing is enough. Capture at 4K for crops.

### 4.2 Parts: when is a part finished?
1. Hand mask from MediaPipe Hands (convex hull, dilated), excluded from the ink diff.
2. Ink map: adaptive threshold. New ink = ink now AND NOT stable ink.
3. **Finished** when new ink is unchanged for ~1.2 s and the hand (pencil tip) is away from its bounding box. A manual trigger does the same.
4. Group new ink into a part: connected components, merged by vertical overlap into a line.
5. Erasing or crossing out is noted as a self-correction (shown on the dashboard).

Classical CV, ~10 ms per frame. The reader runs about once per part, not 30 times a second.

### 4.3 Reader (OCR)
- Crop with a 10–15 % margin from the last stable page image before the hand arrived. Deskew, normalise contrast, resize.
- Output: a LaTeX subset (numbers, fractions, powers, roots, `+ − × ÷ =`, variables, parentheses) and a confidence.
- **Decision gate, first 3 hours:** benchmark an off-the-shelf small model, a mid-size VLM and a big API VLM on ~100 real lines written under the Brio. Use the smallest that is good enough. Fine-tuning only if nothing is, and only as a stretch goal (no time for 200k synthetic lines in 24 h).
- Escalation: confident and parseable → go on. Unsure → the child confirms on screen. Still unclear → only the crop goes to a big VLM.

### 4.4 Show what you wrote
- Each part is typeset on screen (KaTeX) as soon as it's read, in order, with its verdict once known.
- The same region is outlined on the live paper (inverse homography): blue while reading, a tick when right, an orange circle when wrong.

### 4.5 Reasoner: right or wrong, and why
- Fractions are kept exactly as written: 4/6 is not 2/3, the form is evidence.
- Check each part against the problem, or against the previous step.
- **Misconception:** run every bug in the library; a bug only counts if it reproduces the child's *exact* answer.
- No match → an LLM proposes `{name, python_function}`. Accepted only if, run in a sandbox with a timeout, it reproduces the exact answer, is not a constant (`return 4/6` explains nothing), and is wrong on other problems. Accepted bugs join the library.
- Several bugs match → the recommended exercises are chosen so each bug predicts a different answer.

### 4.6 Teaching, personalised over iterations
- **Styles:** `pictures` (pie comparison), `bars` (fraction bars), `steps` (a worked example on a parallel problem, never the child's own answer), `number_line` (later).
- **Teaching profile per child:** for each style, how often a recommended exercise was right right after it.
- **Choosing a style** for a misconception:
  1. Never the style that just failed for this misconception.
  2. Otherwise the best success rate for this child, `(wins + 1) / (tries + 2)`.
  3. Ties: the default for the misconception (pictures for "adds the tops and the bottoms").
- The screen says why, in plain words: "Pictures didn't click yet, so this time: fraction bars."
- **Outcome:** the next part that answers a recommended exercise for this misconception decides it. Right means a win for that style; wrong means a try, and the next explanation uses a different style.
- Scenes are data (JSON), never drawing code from a model. Every number is checked before rendering.

### 4.7 Similar exercises
- Same skill, same kind of numbers, not the same problem.
- Prefer problems where the suspected bug gives a recognisably wrong answer, so the next attempt tells "fixed" apart from "still there".
- Show 2–3, the first highlighted. After two right in a row, step up the difficulty.

### 4.8 Point and ask
- Trigger: index finger extended, other fingers curled, still for ~0.5 s over the page, plus voice activity. Fallback: a held key or mouse button.
- Fingertip (landmark 8) → page coordinates → nearest part → nearest symbol. Use its position at the moment the child says "this", "ça", "das"; otherwise the steadiest position.
- Speech to text: mlx-whisper on Mac, faster-whisper elsewhere; language detected automatically.
- Question types: `why_wrong` (diagnosis + visual), `what_next` (next step as a hint, never the answer), `what_is` (concept explanation), `is_right` (checker), `other` (small LLM, structured context only).
- Target latency: end of question → spoken answer in under 2 s.

### 4.9 Records and dashboard
- Every part, verdict, misconception, teaching (style + outcome), exercise and question is stored per student.
- `GET /api/students` (list) and `GET /api/students/:id` (summary) feed the dashboard.

### 4.10 Frugality (AXA)
- Cascade: pencil-lift gate → crop only → small local reader → child confirmation → big VLM.
- Every escalation is logged with step, reason, tokens and cost. Shown on the dashboard.
- Baseline for the pitch: a 4K frame every 2 s to a big VLM.

---

## 5. Web ↔ engine protocol

JSON over one WebSocket at `/ws`. Full table in `docs/protocol.md`.

- Engine → web: `hello`, `status`, `part` (new or updated part with LaTeX, confidence, verdict), `confirm`, `teach`, `exercises`, `profile`, `hint`, `question`, `answer`.
- Web → engine: `session_start`, `cut_part` (manual trigger), `part_typed` (development: type a part instead of writing it), `confirm_reply`, `pick_exercise`, `ask_start` / `ask_end` (manual trigger for questions), `question_typed`, `session_end`.

---

## 6. Models

| Model | Status | Notes |
|---|---|---|
| Handwriting reader (crop → LaTeX) | off-the-shelf first; fine-tune only if the gate says so | the AXA cost story depends on it |
| Hand landmarks (MediaPipe Hands) | off-the-shelf | hand mask + pointing gesture |
| Speech to text (Whisper small) | off-the-shelf | local |
| Small instruct LLM | off-the-shelf + verifiers | bug hypotheses, phrasing, `other` questions |
| Big VLM / LLM (OpenRouter) | fallback only | logged |

Out of scope: RL, learned teaching policies, training on children's data.

---

## 7. Tech stack

```
[MX Brio] → engine: Python, FastAPI + WebSocket
              ├─ OpenCV (rectify, ink diff, crops) · MediaPipe Hands
              ├─ reader (PyTorch MPS or ONNX) · OpenRouter fallback + cost log
              ├─ mlx-whisper / faster-whisper
              └─ reasoner, teacher, exercises, records (pure Python, SymPy)
          → web: Vue 3 + Tailwind CSS v4 + Vite (Node.js), TypeScript, KaTeX
```

Latency budget, pencil lift → verdict on screen: part detection ~10 ms · crop ~5 ms · reader 150–400 ms · check and diagnosis < 20 ms · render < 50 ms.

---

## 8. Evaluation (results slide)

| Metric | Method |
|---|---|
| Reader exact match | ~100 real lines under the Brio: chosen reader vs big VLM |
| Part detection | parts cut correctly vs merged or split, on recorded sessions |
| Misconception precision / recall | teammates make assigned mistakes |
| Personalisation | sessions where the second style worked after the first didn't |
| Escalation rate and cost per hour | Glimpse vs the naive baseline |
| Latency | pencil lift → verdict; end of question → answer |

---

## 9. Build plan (from Saturday 17:00 to Sunday 12:00)

| Time | Goal |
|---|---|
| Sat 17–20 | Camera capture + rectify; reader benchmark on real lines; web Session page on demo data (done) |
| Sat 20 – Sun 01 | **End to end on fractions:** manual trigger → crop → reader → check → teach → exercises on screen |
| Sun 01–05 | Automatic pencil-lift detection; pointing gesture + speech + answer; dashboard on real records |
| Sun 05–09 | **Feature freeze.** Fix bugs, rehearse under demo lighting 10+ times, measure numbers |
| Sun 09–12 | Backup video, slides, submit before 12:00 |

Rule: a feature is in the demo only if it worked 10 times in a row by Sunday 05:00. The browser's demo mode is the fallback.

### Team split (4 people)
1. **Vision:** capture, rectify, parts (pencil lift), hand tracking, pointing target
2. **Reader + speech:** reader benchmark and cascade, Whisper, question answering
3. **Tutor core:** reasoner, misconception library, teacher (styles, profile), exercises, records
4. **Web + pitch:** Session page, dashboard, visuals, demo script

---

## 10. Demo script (~3 min)

1. **Setup (15 s):** a desk, the Brio looking down, a sheet of paper. "Kids repeat the same mistake for years because nobody sees *why*."
2. **Loop (75 s):** write `1/5 + 2/5 = 3/5`, lift the pencil: it appears on screen, ticked. Write `3/4 + 1/2 = 4/6`: it appears, circled on the paper; "adds the tops and the bottoms"; a pie picture shows 4/6 is smaller than 3/4; a spoken hint; three similar exercises. Write one wrong again: the next explanation switches to fraction bars, "pictures didn't click yet". Write the next one right: "it clicked with fraction bars".
3. **Point and ask (30 s):** point at the 6, ask "pourquoi c'est faux ?", get the answer in French with a picture.
4. **Dashboard (30 s):** what she wrote, the misconception and when it got fixed, which style works for her, what to practise next, and the AI cost of the session.
5. **Impact (30 s):** free, local, multilingual, privacy shutter; built for schools and NGOs.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Pencil-lift detection cuts parts badly | manual trigger; tune on recorded sessions; one line per part on the demo sheet |
| Misreading handwriting | confirmation tap when unsure; thick dark pencil; benchmark early |
| Wrong diagnosis | bugs must reproduce the exact answer; the confirmation exercise tests it |
| Pointing imprecise | highlight the target and let the child re-point; part level before symbol level |
| Lighting or camera drift on stage | locked camera settings, own lamp, tripod, same setup as rehearsal |
| Wifi or API down | everything core is local; the browser demo mode; recorded backup video |
| Scope creep | freeze at Sunday 05:00 |
