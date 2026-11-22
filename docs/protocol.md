# What the web app expects from the engine

One WebSocket at `/ws`, JSON messages with a `type`. The shapes are in `web/src/lib/types.ts`; `web/src/lib/demo.ts` is a working reference that sends exactly these events. Build the engine against this.

> `engine/` is still the v1 prototype and speaks the **old** protocol. While it's running, the web app connects to it and won't work. Stop it (or update it to this protocol) and the web app falls back to demo mode.

Maths travels as LaTeX: `\frac{3}{4}+\frac{1}{2}=\frac{4}{6}`. Fractions are never reduced: 4/6 is evidence, 2/3 is not.

## Web → engine

| type | fields | when |
|---|---|---|
| `session_start` | `student`, `name`, `lang`, `subject` | a child is picked. `subject`: `maths`, `reading` or `science` |
| `subject` | `subject` | the child picked another subject under *Choose a practice*; check that subject from now on |
| `cut_part` | `image?` | "this line is finished, read it now": the browser saw the pencil lift (or a key / button was pressed). `image` is a JPEG data URL of the whole camera frame, already the right way up. **The browser owns the camera** (`getUserMedia`); the engine never opens it |
| `part_typed` | `text` | development: type a part (`"3/4 + 1/2 = 4/6"`) instead of writing it |
| `confirm_reply` | `partId`, `ok` | the child answered "Did you write this?" |
| `pick_exercise` | `id` | the child chose the next similar exercise |
| `ask_start` / `ask_end` | | manual trigger for a question (the engine normally detects pointing + speech itself) |
| `question_typed` | `text`, `partId?` | development: ask without speech. Without `partId` the question is about the line whose maths it quotes, or the newest wrong line for "why is it wrong?"; an empty question is ignored |
| `point` | `image`, `x?`, `y?`, `text?` | the child points at the paper and holds still (hand tracking in the browser), or presses Ask: the whole frame (never cropped), the fingertip (0-1 in that frame) and the typed question. The engine reads the whole page with the OCR model, then the tutor gets the photo (fingertip marked), the text and the question |
| `session_end` | | "End session". Once ended, a session only takes `set_age`, `subject` and `pick_exercise` (new work is refused: start a new session); `session_end` again sends the same summary |

## Engine → web

| type | fields | effect |
|---|---|---|
| `hello` | `version`, `camera` | connected (`camera` is no longer used: the browser opens the camera itself) |
| `status` | `state`: `idle`, `watching`, `reading`, `thinking`, `listening`, `answering` | status pill |
| `part` | `part`: `{id, latex, confidence, verdict, note?, exerciseId?, box?, at}` | adds or updates a line under *What you wrote*. `verdict`: `reading` → `correct` / `wrong` / `unsure`. `box` = `[x, y, w, h]` normalised to the frame the browser sent, to draw the outline, tick or circle on the video. Without `box`, the web app uses the line slots of the printed sheet (`/worksheet`, `web/src/lib/geometry.ts`) |
| `confirm` | `partId`, `latex` | "Did you write this?" Yes / No |
| `teach` | `teaching` or `null` | *Let's see why*: `{partId, misconception: {id, name}, style, iteration, why, title, visual, steps}`. `null` clears it |
| `exercises` | `items: [{id, latex, target?}]`, `currentId?` | *Try a similar one* in the camera window, the desk's *Next step* and bell, and "N to try" on the current subject |
| `profile` | `profile: {style: {tries, wins}}` | the child's teaching profile (shown on the dashboard) |
| `hint` | `hint: {text, lang, translation?}` or `null` | what Glimpse says, shown and spoken |
| `question` | `question: {text, lang, final, pointedAt?: {partId, token}}` | live transcript and pointed target |
| `answer` | `answer: {text, lang, translation?, visual?}` | the answer to a question |
| `page` | `page: {lines: [[{t: 'text' or 'math', v}]], ms, at}` | the whole paper as the OCR model read it ("The whole page" card) |
| `steps` | `steps: {about, title, items: [{say, math}], result, lang, at}` | the whole solution of the newest unfinished or wrong line, or of what was pointed at, worked out by the tutor ("Step by step" card, one step at a time) |

`style` is one of `pictures`, `bars`, `steps`, `number_line`. `name` in a misconception is phrased to follow "you", e.g. `added the tops and the bottoms`.

## Visual scenes

The AI never writes drawing code. It picks a scene and fills in numbers; the engine checks every number first.

```json
{ "kind": "compare_pies",
  "left":  { "n": 4, "d": 6, "label": "your answer, 4/6", "tone": "marker" },
  "relation": "<",
  "right": { "n": 3, "d": 4, "label": "3/4 on its own", "tone": "pen" } }

{ "kind": "bar_model",
  "rows": [ { "n": 2, "d": 5, "label": "2/5", "tone": "pen" },
            { "n": 6, "d": 15, "label": "6/15", "tone": "pen", "note": "cut both into fifteenths" } ] }

{ "kind": "worked", "caption": "The same kind of problem, worked out",
  "lines": [ "\\frac{1}{3}+\\frac{1}{6}", "=\\frac{2}{6}+\\frac{1}{6}", "=\\frac{3}{6}" ] }
```

## Dashboard API

`GET /api/students` returns a list of `StudentSummary` (shape in `web/src/lib/mock.ts`). Without it, the dashboard uses this browser's session plus sample data.
