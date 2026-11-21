# Web ↔ engine protocol

One WebSocket at `/ws`, JSON messages with a `type`. Types are mirrored in `web/src/lib/types.ts`; the demo engine (`web/src/lib/demo.ts`) and the real engine (`engine/glimpse_engine/server.py`) speak the same language.

Fractions are always sent exactly as written, never reduced: `{"n": 4, "d": 6}`.

## Web → engine

| type | fields | when |
|---|---|---|
| `session_start` | `student`, `worksheet`, `lang` | "Start writing" on Setup, "Another round" |
| `check` | | thumb button / C: read and check the line the child just finished |
| `check_typed` | `problem`, `answer` (text such as `"4/6"`) | development: drive the checker without a camera |
| `ask_start` | | side button pressed: start recording and tracking the fingertip |
| `ask_end` | | side button released: answer the question |
| `confirm_reply` | `problem`, `ok` | child answered "Did you write …?" |
| `session_end` | | "I'm done" |

## Engine → web

| type | fields | effect in the app |
|---|---|---|
| `hello` | `version`, `camera` | connected. `camera: false` = show the drawn worksheet instead of video |
| `status` | `state`: `idle`, `watching`, `reading`, `thinking`, `listening`, `answering` | status pill |
| `setup` | `checks`: `{camera, markers, light, button, mic}`, each `{ok: true / false / null, detail}` | Setup checklist |
| `worksheet` | `id`, `problems: [{id, a, b}]` | resets the session |
| `progress` | `current` | "Problem 2 of 6" |
| `written` | `problem`, `answer` | what the reader read (drawn in handwriting in demo mode) |
| `mark` | `mark: {problem, verdict, label?, box?}` | tick (`correct`), orange circle + label (`wrong`), dashed box (`next`). `box` = `[x, y, w, h]` in normalised camera coordinates, for drawing over the video |
| `explain` | `explanation` or `null` | the visual explanation; `null` clears it |
| `hint` | `hint: {text, lang, translation?}` or `null` | footer text, read aloud |
| `confirm` | `problem`, `guess` | "Did you write 5/8?" Yes / No |
| `transcript` | `ask: {text, lang, final, pointedAt?: {problem, token}}` | live transcript while asking; highlights the pointed token |
| `answer` | `explanation` or `null`, `hint` | the answer to a spoken question |
| `insight` | `insight: {text, evidence}` | "What clicked today" on the summary |

## Visual

The AI never writes drawing code. It picks a scene and fills in numbers; the engine checks every number before sending.

```json
{ "kind": "compare_pies",
  "left":  { "n": 4, "d": 6, "label": "your answer, 4/6", "tone": "marker" },
  "relation": "<",
  "right": { "n": 3, "d": 4, "label": "3/4 on its own", "tone": "pen" } }

{ "kind": "bar_model",
  "rows": [ { "n": 3, "d": 4, "label": "3/4", "tone": "pen" },
            { "n": 1, "d": 2, "label": "1/2", "tone": "marker" },
            { "n": 2, "d": 4, "label": "2/4", "tone": "marker", "note": "cut the half into quarters" } ] }
```

New scene kinds (number line, balance scale for equations) are added in both `types.ts` and `ExplainPanel.vue`.
