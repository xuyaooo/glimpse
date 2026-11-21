# Glimpse: Technical Specification

> A webcam tutor that watches children solve math on paper, finds the exact misconception behind a mistake, and explains it visually in the child's own language.

LauzHack 2026 · Target challenges: **Logitech · AXA · IMC · Scholé** (+ main ranking)

---

## 1. Overview

A child solves math problems on a printed worksheet with a normal pen. A Logitech MX Brio, tilted down at the desk, streams the paper. When the child finishes a line, Glimpse:

1. reads the handwriting (small fine-tuned VLM, output as LaTeX),
2. checks every step symbolically (SymPy),
3. finds *why* it's wrong: a misconception, proven by code that reproduces the child's exact wrong answer,
4. picks a teaching move (hint, visual, easier problem, move on),
5. shows a verified visual explanation, circles the mistake on the live image of the child's paper, and speaks a short hint in the child's language.

The child can also **point at any part of their work and ask a question aloud** ("Why is this wrong?").

### Core principles
- **The AI proposes, code verifies.** No AI output reaches the child unchecked.
- **Small and local first, big model only as a fallback.** Escalation rate and cost are logged.
- **No chat window.** The interface is the child's own paper, visuals and voice.
- **Must work on stage.** A reliable MVP comes first; every add-on is swappable.

---

## 2. Challenge mapping

| Challenge | What we deliver |
|---|---|
| **Logitech** | Webcam + mic as the AI's eyes and ears: 4K desk view (Show Mode), hand/fingertip tracking, pointing + voice questions, MX Master button as trigger (haptics as a bonus) |
| **AXA** | Text + image multimodal input; frugal cascade (ink gate → crop → small local VLM → big model only when needed); measured cost/hour vs naive baseline; own designed visuals (no slop) |
| **IMC** | Free tutor for schools and NGOs; native-language hints and voice; teacher dashboard |
| **Scholé** | Diagnoses misconceptions instead of marking wrong; adaptive next problem; visual "click" moment; no chat UI |

---

## 3. Hardware

| Device | Use |
|---|---|
| **MX Brio** | 4K/30 fps (reading crops) or 1080p/60 fps (hand tracking). Tilted down (Show Mode) or on a tripod/arm. FOV 65° for max pixels on the worksheet. **Lock focus, exposure and white balance** (Logi Options+ / Logi Tune). Dual beamforming mics for questions. Privacy shutter (pitch point). |
| **MX Master 4** | Button mapped (Logi Options+) to a keyboard shortcut: click = "check", hold = "ask a question". Optional: haptic feedback via the Logitech Actions SDK; ask the Logitech mentors. |

No Logitech SDK is required for the camera; it's a standard UVC webcam (`cv2.VideoCapture` / `getUserMedia`).

---

## 4. Architecture

```
INPUTS         Brio camera        MX Master button        Brio mic
                   │                     │                   │
PERCEPTION     Page + ink         Hand + fingertip      Speech to text
               (OpenCV, ArUco)    (MediaPipe)           (Whisper, local)
                   │                     │                   │
UNDERSTANDING  Handwriting reader  Pointed target       Question router
               (fine-tuned VLM)    (fingertip → page)   (small classifier)
                   │                     │                   │
TUTOR CORE     Step checker  ──►   Bug finder      ──►  Teaching decision
               (SymPy)             (LLM + code check)   (rules + learner model)
                                                             │
OUTPUTS        Visual explainer    Paper overlay        Spoken hint
               (scene DSL)         (circle mistake)     (local TTS)

Fallback: big VLM / LLM via OpenRouter, called only when local confidence or checks fail.
```

### Two flows
- **Check an answer:** camera → page + ink → reader → step checker → bug finder → teaching decision → outputs
- **Ask a question:** button held + mic + fingertip → speech to text + pointed target → router → tutor core → outputs

---

## 5. Component specifications

### 5.1 Page flattening (registration)
- **Worksheet:** printed A4 with 4 ArUco markers (`cv2.aruco`, e.g. `DICT_4X4_50`) in the corners and one fixed answer box per problem (IDs and box coordinates known in page space).
- **Per frame:** detect markers → `cv2.findHomography` → `cv2.warpPerspective` into a rectified page (e.g. 2480×3508, ~300 dpi equivalent).
- **Smoothing:** keep the last valid homography if markers are briefly occluded by the hand; recompute only when the markers move > N px.
- **Processing rate:** ~5 fps is enough (writing is slow). Capture at 4K for crops.

### 5.2 Ink detection (frugality gate)
1. **Hand mask:** MediaPipe Hands landmarks → convex hull → dilate → map to page coordinates → exclude from the diff.
2. **Ink map:** grayscale → adaptive threshold (or Sauvola) → dark-pixel mask.
3. **New ink:** `new = ink_now AND NOT ink_stable` (ignore regions under the hand mask).
4. **Line-finished trigger:** new ink unchanged for ~1–1.5 s **and** hand away from that region. MVP alternative: MX Master button press.
5. **Line segmentation:** connected components → group by vertical overlap / horizontal projection profile → bounding box.
6. **Erasure/scribble detection:** ink disappearing, or dense crossing strokes → "self-correction" signal for the learner model.
7. Update `ink_stable` after each processed line.

**Cost:** classical CV, ~10 ms/frame. The VLM runs ~once per written line instead of 30×/min.

### 5.3 Crop and normalise
- Crop from the full-resolution rectified page with a 10–15 % margin.
- Deskew, contrast-normalise, resize to model input (384–768 px long side). Keep colour.
- **Occlusion rule:** always crop from the **last stable page image before the hand arrived**.

### 5.4 Handwriting reader (main trained model)
- **Task:** crop → LaTeX subset (numbers, fractions incl. stacked, powers, roots, `+ − × ÷ =`, variables, parentheses, simple functions).
- **Candidates:** Florence-2 (base 230M / large 770M; first choice), SmolVLM (256M/500M), small Qwen-VL (2–3B) as mid-tier.
- **Decoding:** grammar-constrained (Outlines / XGrammar) to a LaTeX-subset grammar → always parseable.
- **Confidence:** token log-probs → sequence confidence; optional self-consistency (N=4–8 samples, agreement rate).
- **Calibration:** temperature scaling on a validation split.

**Training data**
- **Synthetic (main):** problem generator → correct steps or bug-injected wrong steps → rendered as handwriting (handwriting fonts + real symbol strokes from MathWriting / digit datasets with random slant, size, spacing, stroke width) → composited on real paper backgrounds (blank, lined, squared) → augmentation (perspective, blur, shadows, lighting, JPEG, pen colours, crossed-out parts). Target 200k–1M lines.
- **Public:** Google MathWriting, CROHME (filtered to the needed symbols).
- **Real:** ~300 lines written by the team on real worksheets under the real Brio → **test set only** (plus an optional small fine-tune split).

**Recipe:** SFT (full fine-tune for ≤1B, LoRA for larger), 1–3 epochs synthetic, short pass on real data. A few GPU-hours. No RL.

**Decision gate (hours 0–4):** benchmark off-the-shelf small VLM vs mid VLM vs big API VLM on 100 real lines. If the small one is already ≥95 % exact match, skip training.

### 5.5 Step checker (SymPy)
- Parse with `sympy.parsing.latex.parse_latex`; exact arithmetic with `Rational`.
- Check the first line against the problem, then each line against the previous one (`simplify(a - b) == 0`, or equation-solution-set equivalence).
- Labels per step: `correct | wrong | incomplete | unsimplified`. Output: index of the first wrong step.

### 5.6 Bug finder (misconception diagnosis)
1. **Cache lookup:** run every bug function in the library on the problem; an exact match with the student's answer means diagnosed (instant, free).
2. **If no match → LLM hypothesis:** input = problem, correct step, wrong step. Output (constrained JSON): `{name, description, python_function}`.
3. **Verify by execution** (sandboxed, timeout): the function must reproduce the student's **exact** wrong answer. Up to 3 attempts.
4. **Confirm on the student:** generate the next problem so the bug predicts a *distinctive* wrong answer; if the student produces it, it's a misconception, not a slip.
5. **Bayesian belief per student:** `P(bug | evidence) ∝ P(answer | bug) · P(bug)`, including a "random slip" hypothesis.
6. **Add verified bugs to the library** (cache).

Seed library: ~20–30 documented bugs (fractions: add across, common denominator without scaling, cross-multiply on add, simplify by subtracting, whole + fraction; equations: wrong sign when moving a term, divide only one term; etc.).

### 5.7 Learner model
- **Skills** per topic (e.g. `add_same_den`, `common_den`, `scale_numerator`, `simplify`, `isolate_variable`, …).
- **Bayesian Knowledge Tracing** per skill (p_init, p_learn, p_slip, p_guess), hand-set parameters.
- **Behaviour signals** (top-down camera): time to start, mid-line pauses, erasures/crossing out, hand hovering.
- The face is not visible from the desk view; skip facial signals (or use the laptop camera as an optional second view).

### 5.8 Teaching decision (rules)
- **Actions:** wait · small hint · visual counter-example · alternative visual · easier sub-problem · targeted diagnostic problem · move on / harder.
- **Example rules:** first wrong step + bug seen once → small hint; same bug twice → visual counter-example; mastery > 0.95 → move on; long hesitation (> 20 s) → offer a hint before an error.
- No learned policy (no Tutor Gym / RL), by decision.

### 5.9 Pointing + voice questions
1. **Push-to-talk:** hold the MX Master button → record from the Brio mic + track the fingertip.
2. **ASR:** faster-whisper / whisper.cpp (small), local, auto language detection, word timestamps.
3. **Pointed target:** MediaPipe index fingertip (landmark 8) → page homography → nearest problem → line → token (character boxes from the reader, or connected components). Use the fingertip position at the timestamp of deictic words ("this", "here", "ça", "das"); else the steadiest position. Pen-tip estimate = extend along the index-finger direction.
4. **Confirm:** highlight the target on the live overlay; if wrong, the child points again.
5. **Question router:** multilingual sentence embeddings + logistic regression (or a small fine-tuned encoder), trained on ~1–2k LLM-generated questions. Classes: `why_wrong | what_next | what_is | is_right | other`.
6. **Answering:**
   - `why_wrong` → bug finder result + visual
   - `what_next` → next correct step as a hint, never the answer
   - `what_is` → pre-written concept explanation + visual
   - `is_right` → step checker
   - `other` → small instruct LLM with structured context only (problem, transcription, target, diagnosis, question). Rules: never state the final answer (checked with SymPy before speaking), 1–2 sentences, same language, steer back on topic. Fallback: generic hint.

**Latency target:** button release → answer in 1.5–2 s.

### 5.10 Visual explainer (scene DSL)
- The LLM **never writes drawing code.** It outputs a JSON scene in a small DSL; the renderer draws it.
- **Primitives:** `pie`, `bar_model`, `area_model`, `number_line`, `array`, `grid`, `base10_blocks`, `balance_scale`, `axes`, `function_plot`, `point`, `segment`, `angle`, `polygon`, `label`, `highlight`, `arrow`, `step` (animation).
- **Example:**
  ```json
  {"scene": [
    {"type": "balance_scale", "left": ["2x", "+3"], "right": ["7"]},
    {"type": "step", "action": "remove", "from": "both", "item": "3",
     "caption": "Take 3 away from BOTH sides"},
    {"type": "balance_scale", "left": ["2x"], "right": ["4"]}
  ]}
  ```
- **Validation before drawing:** JSON schema (constrained decoding) → SymPy consistency of every number/expression → render check (no errors, no label overlaps). On failure: one retry, then a simpler visual.
- **Fast path:** hand-made templates (e.g. `compare_pies(3/4, 4/6)`) for the rehearsed demo topics, chosen by rules from the bug.
- **Renderer:** SVG/canvas components; Mafs or JSXGraph for graphs and geometry.

### 5.11 Paper overlay
- Draw highlights on the live camera view using the **inverse homography** (page → camera coordinates): circle the wrong token/line, tick correct lines.

### 5.12 Spoken hint
- Hints and concept texts pre-generated offline in ~10 languages by an LLM, reviewed, stored as templates with number slots.
- Local TTS (Piper) or the system voice; short sentences; the visual carries most of the explanation.

### 5.13 Escalation / fallback (frugality)
- **Reader:** confident + plausible (parses and matches the correct answer or a known bug) → proceed; uncertain → ask the child "Did you write 4/6? ✅ / ✏️"; still unclear → send **only the crop** to a big VLM (OpenRouter).
- **LLM parts:** small local model first; if its output fails verification → big model with the **same verifiers**.
- **Log every escalation:** tier, tokens, cost.

### 5.14 Teacher / NGO dashboard (nice-to-have)
- Per child: bugs detected, mastery per skill, time on task, progress over time.

---

## 6. Models summary

| Model | Status | Notes |
|---|---|---|
| Handwriting reader (small VLM → LaTeX) | **Train (SFT)** if the benchmark says so | Main trained model; key for accuracy and AXA |
| Question router | Train (tiny) | Embeddings + logistic regression; minutes |
| Hypothesis / scene / "other" LLM | Off-the-shelf small instruct LLM + verifiers | Optional later: SFT distillation on big-model outputs that **passed** verifiers (no RL) |
| MediaPipe Hands | Off-the-shelf | |
| Whisper (small) | Off-the-shelf | Fine-tune on children's speech only if tests show a problem |
| TTS (Piper) | Off-the-shelf | |
| Big VLM / LLM (OpenRouter) | Fallback only | AXA key |

Explicitly **out of scope:** RL / GRPO, Tutor Gym, learned teaching policy.

---

## 7. Tech stack

```
[Brio 4K] → Python backend (FastAPI + WebSocket)
              ├─ OpenCV (ArUco, homography, ink diff)
              ├─ MediaPipe Hands
              ├─ Reader: PyTorch (Mac MPS) or ONNX Runtime
              ├─ faster-whisper / whisper.cpp
              ├─ SymPy, sandboxed bug execution
              ├─ Learner model + rules
              └─ OpenRouter client (fallback) + cost logger
           → Frontend: React + canvas/SVG (live view, overlay, visuals, dashboard)
Training: PyTorch + Hugging Face transformers / PEFT on team GPUs
```

**Latency budget (pen-lift → feedback, < 1 s):** ink trigger ~10 ms · crop ~5 ms · reader 150–400 ms · SymPy < 10 ms · bug library < 10 ms · rules < 1 ms. (An LLM hypothesis for an uncached bug adds ~1–2 s.)

---

## 8. Evaluation (results slide)

| Metric | Method |
|---|---|
| Reader exact match + CER | 300 real lines: our model vs off-the-shelf small vs big API VLM |
| Bug detection precision / recall | Staged mistakes by teammates with assigned bugs |
| Generalisation | Problems from a topic never prepared (e.g. powers, percentages) |
| Escalation rate | Share of lines/requests sent to the big model (target < 5 %) |
| Cost per hour of tutoring | Glimpse vs naive "4K frame every 2 s to a big VLM" |
| End-to-end latency | Pen-lift → feedback; button release → spoken answer |

---

## 9. Build plan (48 h)

| Hours | Goal |
|---|---|
| 0–4 | Worksheet + ArUco + rectified crop; reader benchmark on 100 real lines; seed bug library (~10 bugs) |
| 4–12 | **End-to-end MVP** on one topic (adding fractions): button trigger → reader → SymPy → bug library → rule → template visual → overlay |
| 12–24 | Auto line trigger, confirmation button, 3–4 problem types, second topic (linear equations), spoken hints. **Core feature freeze.** |
| 24–36 | Reader fine-tuning (if needed); pointing + voice questions; LLM bug hypothesis + scene DSL; cost logging |
| 36–44 | Rehearse the demo 10+ times under demo lighting; fix bugs only |
| 44–48 | Backup video, slides, pitch |

**Rule:** an add-on goes into the demo only if it has worked 10 times in a row by hour 36.

### Team split (4 people)
1. **Data:** problem generator, bug library, handwriting renderer and augmentation, real test set
2. **Models:** reader fine-tuning, calibration, export; question router
3. **Vision pipeline + backend:** ArUco, hand mask, ink trigger, pointing, ASR, tutor core, escalation
4. **Frontend + pitch:** live overlay, DSL renderer and templates, dashboard, demo script

---

## 10. Demo script (~3 min)

1. **Setup (15 s):** child's desk, Brio pointing down, worksheet. "Kids make the same mistakes for years because nobody sees *why*."
2. **Fractions (45 s):** write `3/4 + 1/2 = 4/6` → the line is circled on the live paper, "adds across" detected, the pie visual shows 4/6 < 3/4, spoken hint. Next problem is chosen to confirm the bug.
3. **Point + ask (30 s):** point at the 6, hold the button, ask "pourquoi c'est faux ?" → answer in French with a visual.
4. **Generalisation (30 s):** a juror writes an unprepared problem (e.g. an equation with a sign error) → bug discovered by the LLM, **verified by code**, balance-scale visual.
5. **Numbers (30 s):** reader accuracy vs big VLM, escalation rate, cost per hour vs naive baseline.
6. **Impact (30 s):** free, local, multilingual, privacy shutter; built for schools and NGOs.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Misreading handwriting → wrong correction | Confirmation prompt when uncertain; fine-tuned reader; thick black pen in the demo |
| Lighting / camera drift on stage | Locked camera settings, own desk lamp, tripod, same setup as rehearsal |
| LLM hypothesis wrong or slow | Execution check; cached library for demo topics; big-model fallback |
| Visual scene wrong | Schema + SymPy + render checks; templates for demo topics |
| Pointing imprecise | Highlight + re-point; problem/line level before token level |
| Whisper weak on children / accents | Push-to-talk, short questions, language hint from the student profile |
| Wifi / API down | Everything core runs locally; recorded backup video |
| Scope creep | Freeze at hour 24 (core) and 36 (add-ons) |
