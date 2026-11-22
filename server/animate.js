// Animations for young children ("kids mode").
//
// The numbers are decided HERE, in code, so the animation is always mathematically right:
//   1. parseArithmetic() reads exercises like "1/2 + 1/4", "3 + 4", "\frac{2}{3} - \frac{1}{3}".
//   2. planFromArithmetic() turns them into a plan:
//        fractions          -> chocolate bar(s) cut into equal pieces
//        small whole numbers -> objects (apples, cookies...) appearing / flying away
//        bigger numbers      -> a frog hopping on a number line
//   3. The tutor model only writes the child-friendly words (title, object, one sentence
//      per step) as structured JSON.
// For exercises we can't parse (word problems), the model proposes the whole plan and we
// check that its steps add up before playing it.
import { chat } from './ollama.js'

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a))
const lcm = (a, b) => (a / gcd(a, b)) * b
export const OBJECTS = ['apple', 'cookie', 'star', 'candy', 'strawberry', 'ball', 'flower', 'fish']
const MAX_OBJECTS = 20
const MAX_PIECES = 12 // pieces per chocolate bar

// "1/2 + 1/4" -> [{sign:1,n:1,d:2},{sign:1,n:1,d:4}] ; null if there is no +/- arithmetic
export function parseArithmetic(text) {
  if (!text) return null
  const s = text
    .replace(/\\[dt]?frac\s*\{\s*(\d+)\s*\}\s*\{\s*(\d+)\s*\}/g, '$1/$2')
    .replace(/\\(left|right)/g, '')
    .replace(/\$|\\\(|\\\)|\\\[|\\\]/g, ' ')
    .replace(/[−–]/g, '-')
  const term = String.raw`\d+(?:\s*/\s*\d+)?`
  const re = new RegExp(String.raw`(?<![\w.])${term}(?:\s*[+-]\s*${term}(?![\w.]))+`, 'g')
  let best = null
  for (const m of s.matchAll(re)) if (!best || m[0].length > best.length) best = m[0]
  if (!best) return null
  const terms = []
  for (const t of best.matchAll(/([+-]?)\s*(\d+)(?:\s*\/\s*(\d+))?/g)) {
    const d = t[3] ? Number(t[3]) : 1
    if (d === 0) return null
    terms.push({ sign: t[1] === '-' ? -1 : 1, n: Number(t[2]), d })
  }
  return terms.length >= 2 ? terms : null
}

function fractionLabel(num, den) {
  if (num === 0) return '0'
  const g = gcd(num, den)
  const n = num / g
  const d = den / g
  return d === 1 ? String(n) : `${n}/${d}`
}

// Plan with exact numbers, or null if it can't be shown nicely.
export function planFromArithmetic(terms) {
  if (!terms?.length || terms[0].sign < 0) return null
  const isFraction = terms.some((t) => t.d > 1)
  if (isFraction) {
    const whole = terms.reduce((l, t) => lcm(l, t.d), 1)
    if (whole > MAX_PIECES) return null
    const pieces = terms.map((t) => t.sign * t.n * (whole / t.d))
    let value = pieces[0]
    let max = value
    const steps = []
    for (let i = 1; i < terms.length; i++) {
      value += pieces[i]
      if (value < 0) return null
      max = Math.max(max, value)
      steps.push({ op: pieces[i] >= 0 ? 'add' : 'take', amount: Math.abs(pieces[i]), label: `${pieces[i] >= 0 ? '+' : '−'} ${terms[i].n}/${terms[i].d}` })
    }
    const bars = Math.max(1, Math.ceil(max / whole))
    if (bars > 3) return null
    return {
      scene: 'chocolate',
      whole,
      bars,
      start: pieces[0],
      startLabel: `${terms[0].n}/${terms[0].d}`,
      steps,
      result: { value, label: fractionLabel(value, whole) },
    }
  }
  const vals = terms.map((t) => t.sign * t.n)
  let value = vals[0]
  let min = value
  let max = value
  const steps = []
  for (const v of vals.slice(1)) {
    value += v
    min = Math.min(min, value)
    max = Math.max(max, value)
    steps.push({ op: v >= 0 ? 'add' : 'take', amount: Math.abs(v), label: `${v >= 0 ? '+' : '−'} ${Math.abs(v)}` })
  }
  const base = { start: vals[0], startLabel: String(vals[0]), steps, result: { value, label: String(value) } }
  if (min >= 0 && max <= MAX_OBJECTS) return { scene: 'objects', ...base }
  if (max - Math.min(0, min) > 30) return null
  return { scene: 'number_line', min: Math.min(0, min), max: Math.max(10, max), ...base }
}

// Check a plan proposed by the model: steps must add up and stay in range.
export function checkPlan(plan) {
  if (!plan || !['chocolate', 'objects', 'number_line'].includes(plan.scene)) return null
  const steps = (plan.steps || []).filter((s) => Number.isInteger(s.amount) && s.amount > 0 && ['add', 'take'].includes(s.op))
  let value = plan.start
  if (!Number.isInteger(value) || value < 0) return null
  let max = value
  let min = value
  for (const s of steps) {
    value += s.op === 'add' ? s.amount : -s.amount
    max = Math.max(max, value)
    min = Math.min(min, value)
  }
  if (plan.scene === 'chocolate') {
    const whole = plan.whole
    if (!Number.isInteger(whole) || whole < 2 || whole > MAX_PIECES || value < 0) return null
    const bars = Math.max(1, Math.ceil(max / whole))
    if (bars > 3) return null
    return { ...plan, steps, bars, result: { ...plan.result, value, label: fractionLabel(value, whole) } }
  }
  if (plan.scene === 'objects') {
    if (min < 0 || max > MAX_OBJECTS) return null
    return { ...plan, steps, result: { ...plan.result, value, label: String(value) } }
  }
  if (max - Math.min(0, min) > 30) return null
  return { ...plan, steps, min: Math.min(0, min), max: Math.max(10, max), result: { ...plan.result, value, label: String(value) } }
}

const SYSTEM = `You write the words for a short math animation for children aged 5-7.
Use very simple, warm, playful sentences (max 12 words each), in the same language as the exercise.
Say the numbers out loud in words a child understands (e.g. "one half", "two pieces").`

function wordsSchema(nSteps, scene) {
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      object: { type: 'string', enum: scene === 'objects' ? OBJECTS : scene === 'chocolate' ? ['chocolate'] : ['frog'] },
      start_say: { type: 'string' },
      steps: { type: 'array', minItems: nSteps, maxItems: nSteps, items: { type: 'object', properties: { say: { type: 'string' } }, required: ['say'] } },
      result_say: { type: 'string' },
    },
    required: ['title', 'object', 'start_say', 'steps', 'result_say'],
  }
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    scene: { type: 'string', enum: ['chocolate', 'objects', 'number_line'] },
    object: { type: 'string', enum: [...OBJECTS, 'chocolate', 'frog'] },
    title: { type: 'string' },
    whole: { type: 'integer', description: 'chocolate only: equal pieces in one bar' },
    start: { type: 'integer' },
    start_say: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { op: { type: 'string', enum: ['add', 'take'] }, amount: { type: 'integer' }, label: { type: 'string' }, say: { type: 'string' } },
        required: ['op', 'amount', 'label', 'say'],
      },
    },
    result_say: { type: 'string' },
  },
  required: ['scene', 'object', 'title', 'start', 'start_say', 'steps', 'result_say'],
}

async function askJson(model, messages, schema) {
  const out = await chat({ model, messages, options: { temperature: 0.3, num_ctx: 4096, num_predict: 900 }, think: false, format: schema })
  return JSON.parse(out.content)
}

// exercise text -> playable recipe for the page
export async function makeAnimation(exerciseText, model) {
  const started = Date.now()
  const plan = planFromArithmetic(parseArithmetic(exerciseText))
  if (plan) {
    const words = await askJson(
      model,
      [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Exercise: ${exerciseText}\nAnimation plan (numbers are fixed, do not change them): ${JSON.stringify({
            scene: plan.scene,
            start: plan.startLabel,
            steps: plan.steps.map((s) => `${s.op} ${s.label}`),
            result: plan.result.label,
            ...(plan.scene === 'chocolate' ? { pieces_per_bar: plan.whole } : {}),
          })}\nWrite the title, pick the object, and write one sentence for the start, each step (${plan.steps.length}), and the result.`,
        },
      ],
      wordsSchema(plan.steps.length, plan.scene),
    )
    const say = (i) => words.steps?.[i]?.say || ''
    return {
      recipe: {
        ...plan,
        object: plan.scene === 'chocolate' ? 'chocolate' : plan.scene === 'number_line' ? 'frog' : OBJECTS.includes(words.object) ? words.object : 'apple',
        title: words.title || exerciseText,
        startSay: words.start_say || '',
        steps: plan.steps.map((s, i) => ({ ...s, say: say(i) })),
        result: { ...plan.result, say: words.result_say || '' },
      },
      verified: 'exact', // numbers computed from the exercise
      ms: Date.now() - started,
    }
  }
  // Word problem or something we can't parse: the model proposes the plan, we check it.
  const p = await askJson(
    model,
    [
      { role: 'system', content: `${SYSTEM}\nDesign the animation: pick a scene (chocolate for fractions, objects for small counts, number_line for bigger numbers), the start amount and add/take steps with whole numbers. For chocolate, "whole" is the number of equal pieces in one bar and amounts are pieces.` },
      { role: 'user', content: `Exercise: ${exerciseText}` },
    ],
    PLAN_SCHEMA,
  )
  const checked = checkPlan({
    scene: p.scene,
    whole: p.whole,
    start: p.start,
    startLabel: p.scene === 'chocolate' && p.whole ? `${p.start}/${p.whole}` : String(p.start),
    steps: (p.steps || []).map((s) => ({ op: s.op, amount: s.amount, label: s.label, say: s.say })),
    result: { say: p.result_say },
  })
  if (!checked) return { recipe: null, error: 'Could not make a correct animation for this exercise yet.', ms: Date.now() - started }
  return {
    recipe: {
      ...checked,
      object: checked.scene === 'chocolate' ? 'chocolate' : checked.scene === 'number_line' ? 'frog' : OBJECTS.includes(p.object) ? p.object : 'apple',
      title: p.title || exerciseText,
      startSay: p.start_say || '',
    },
    verified: 'consistent', // steps add up; not checked against the exercise's own answer
    ms: Date.now() - started,
  }
}
