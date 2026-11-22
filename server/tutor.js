// The tutor: prompts and message building for hint / check / solve / ask.
export const TUTOR_MODEL = process.env.TUTOR_MODEL || 'qwen3.5'

// Models a request may pick with { model } (default first). Comma-separated Ollama names.
export const TUTOR_MODELS = [
  ...new Set([TUTOR_MODEL, ...(process.env.TUTOR_MODELS || 'inkling-2-mini,qwen3.5').split(',')].map((s) => s.trim()).filter(Boolean)),
]

// TUTOR_IMAGE: "auto" = send the exercise photo along with the GLM-OCR text when the
// model can see images; "off" = send only the GLM-OCR text (faster, no image prefill).
export const SEND_IMAGE = (process.env.TUTOR_IMAGE || 'auto').toLowerCase() !== 'off'

// TUTOR_THINK: "off" (default: no reasoning, fastest), "auto" (reason only for full
// solutions) or "on". A request can still ask for reasoning with { think: true }
// ("Think harder" in the page).
// Measured with qwen3.5 (9B) on 7 right/wrong student attempts: checking was 7/7 correct
// both with and without thinking, but took ~44 s with thinking vs ~2.7 s without.
const THINK = (process.env.TUTOR_THINK || 'off').toLowerCase()

// How each model is told "no reasoning" / "reasoning" in Ollama's `think` field.
// Inkling 2 Mini has levels (none, minimal, low, ... max; default high): "none" is the
// leanest off-switch, "low" keeps reasoning short when it is wanted. Even at "none" it
// generates ~150 hidden tokens before answering (measured: 206 generated, ~45 shown),
// so its answer-length cap needs that much extra room.
const PROFILES = {
  'inkling-2-mini': { off: 'none', on: 'low', hiddenTokens: 600 },
}
const DEFAULT_PROFILE = { off: false, on: true, hiddenTokens: 0 }
export const profileOf = (model) => PROFILES[model.split(':')[0]] || DEFAULT_PROFILE
export function thinkValue(model, wantThink) {
  const p = profileOf(model)
  return wantThink ? p.on : p.off
}

// Answer-length caps (tokens) without reasoning; keeps answers short and fast.
export const MAX_TOKENS = { hint: 200, check: 400, ask: 500, solve: 1500 }

export const ACTIONS = ['hint', 'check', 'solve', 'ask']

const SYSTEM = `You are a friendly, patient tutor helping a student who is working on paper.
A camera reads the paper with OCR, so the text can contain recognition mistakes (for example 1/l, 0/O, missing exponents or signs). Quietly infer what was meant; if something important is unreadable, say briefly what you assumed.
Rules:
- Reply in the same language as the exercise.
- Use Markdown. Write ALL math in LaTeX: inline $...$ and display $$...$$.
- Be short and clear. Talk to the student directly ("you").
- Help the student learn: unless you are asked for the full solution, never give away the final answer.`

const TASKS = {
  hint: `Give ONE short hint for the student's next step (1-3 sentences).
If the student has already started, build on what they wrote; if they have not written anything yet, give a hint for the first step (do not praise work that does not exist).
Do not solve the exercise and do not give the final answer.`,

  check: `Check the student's work on this exercise.
- If it is complete and correct: start with "✅ Correct" and say in one sentence why.
- Otherwise: say briefly what is right so far, then point out the FIRST mistake (quote the step) and explain why it is wrong in 1-2 sentences, then suggest the next step.
- If they have not started yet, say so and give a small hint to begin.
Do not give the final answer unless the student already reached it.`,

  solve: `Solve the exercise step by step for the student.
Number the steps, explain each one in a sentence, and end with the final answer as $\\boxed{...}$.`,

  ask: `Answer the student's question about this exercise. Help them understand; do not give the final answer unless they explicitly ask for it.`,
}

export function thinkFor(action) {
  if (THINK === 'on') return true
  if (THINK === 'auto') return action === 'solve'
  return false
}

// history: previous turns [{ role: 'user'|'assistant', content }], newest last.
export function buildMessages({ action, exercise = '', work = '', question = '', history = [], imageBase64 = null }) {
  const parts = [
    `## Exercise (read from the page by OCR)\n${exercise.trim() || '(could not read the exercise text; use the image if you have it)'}`,
  ]
  if (action !== 'solve') {
    parts.push(
      `## The student's work so far (OCR of their page; it may also include the exercise itself or other notes, focus on the work for this exercise)\n${
        work.trim() || '(nothing written yet)'
      }`,
    )
  }
  if (action === 'ask') parts.push(`## The student's question\n${question.trim()}`)
  parts.push(`## Your task\n${TASKS[action]}`)
  if (imageBase64) parts.push('A photo of the exercise is attached; use it for figures or anything the OCR missed.')

  const user = { role: 'user', content: parts.join('\n\n') }
  if (imageBase64) user.images = [imageBase64]

  const past = (Array.isArray(history) ? history : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-6)
    .map(({ role, content }) => ({ role, content }))

  return [{ role: 'system', content: SYSTEM }, ...past, user]
}
