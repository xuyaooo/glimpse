// Suggested review: after each session, a few exercises to practise, like the ones done that
// day (the ones that went wrong first). They are the student's own exercises again, or with new
// numbers, and every answer is worked out by code (the animations' maths, `sceneFor`): a
// suggestion is never shown with a wrong answer. The tutor's own ideas are added when the code
// can check them (or, without an answer, when there is nothing else to suggest).
import { plainToTex, sceneFor } from './scenes.js'
import { WORD_KINDS, practiceWord } from './domains.js'

export const REVIEW_MAX = 5
/** Bumped when the suggestions get better: a session's saved ones are made again (unless one was done). */
export const REVIEW_VERSION = 8
const REVIEW_MIN = 3

// The same session always gets the same suggestions (a seeded random generator, not Math.random)
function hash(text) {
  let h = 2166136261
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
function rng(seed) {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const unwrap = (t) => String(t ?? '').replace(/\$/g, '').replace(/\\[()[\]]/g, '').trim()
// A line the reader kept as words, \text{6 x 7 = 48}: its text is the exercise
const untext = (t) => String(t ?? '').replace(/^\s*\\text\s*\{([^{}]*)\}\s*$/, '$1').trim()
/**
 * The same exercise, written a little differently, is one exercise: spaces, \left, a trailing "=",
 * 6 x 7, 6 * 7 and 6 \times 7, 3/4 and \frac{3}{4}.
 */
export const reviewKey = (t) =>
  untext(unwrap(t))
    .replace(/\\[dt]?frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(\d+)\s*\}/g, '$1/$2')
    .replace(/\\times|\\cdot|×|·|\*/g, '*')
    .replace(/(\d)\s*[xX]\s*(?=-?\s*\d)/g, '$1*')
    .replace(/\\div|÷/g, ':')
    .replace(/\\left|\\right|\\[,;! ]|\s|=+$/g, '')
    .toLowerCase()
const family = (k) => (['count', 'number_line', 'columns'].includes(k) ? 'add' : ['groups', 'area_model'].includes(k) ? 'times' : k)

function build(exercise, age, subject) {
  try {
    return sceneFor({ exercise, age, subject }) ?? null
  } catch {
    return null
  }
}

/**
 * The exercise without the student's answer: "6 \times 7 = 48" -> "6 \times 7", "\int_0^2 x^2 dx = 3"
 * -> "\int_0^2 x^2 dx". An equation keeps its "=" ("3x + 5 = 20"): the left side alone is not the
 * same exercise (it is read as another kind of maths, or not at all).
 */
export function questionOf(latex, age) {
  // "= 17/9 + 8/1": the "=" of a line carried on; "1. 3/4 + 1/8", "b) ...", "Q2: ...": the numbering
  const t = untext(unwrap(latex)).replace(/^=+\s*/, '').replace(/^\s*(?:\(?[0-9]{1,2}[.)]|\(?[a-h]\)|q(?:uestion)?\s*\d+\s*[:.)])\s+/i, '')
  const i = t.lastIndexOf('=')
  if (i < 0) return t
  const left = t.slice(0, i).trim()
  const right = t.slice(i + 1).trim()
  if (!left) return t
  if (!right) return left
  const alone = build(left, age)
  if (!alone) return t
  // an answer after the "=" (numbers only: 6 x 7 is a times there), not an equation's other side
  if (isAnswer(right)) return /=/.test(left) ? questionOf(left, age) : left // "1/8 + 6/4 = 6 x 7 = 42"
  const whole = build(t, age)
  return !whole || family(alone.kind) === family(whole.kind) ? left : t
}
const isAnswer = (side) => !/[a-zA-Z]/.test(side.replace(/\\[a-zA-Z]+/g, ' ').replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1*'))

/** "x = 42", "y = -3/4": a result written down, not an exercise to do. */
const isResult = (tex) => /^\s*[a-zA-Z]\s*=\s*-?\s*(?:\d+(?:\.\d+)?|\\[dt]?frac\s*\{\s*\d+\s*\}\s*\{\s*\d+\s*\}|\d+\s*\/\s*\d+)\s*$/.test(untext(unwrap(tex)))

// ---------- new numbers ----------

const ANGLES = [30, 45, 60, 90, 120, 135, 150, 180]

// A nearby number of the same kind: as round as the original (150 -> 120 or 180, not 147), with
// the same number of digits (bigger for "a bit harder"). 0 and 1 stay: they are rarely the point.
function nudge(n, rand, harder) {
  if (!Number.isInteger(n)) {
    const places = (String(n).split('.')[1] || '').length
    const step = 10 ** -places
    const k = 1 + Math.floor(rand() * 4)
    let v = n + (harder ? 3 * k : rand() < 0.5 ? -k : k) * step
    if (v <= 0) v = n + k * step
    return Number(v.toFixed(places))
  }
  if (n <= 1) return n
  const step = [100, 10, 5].find((s) => n % s === 0 && n > s) ?? 1
  const digits = String(n).length
  const reach = step === 1 ? Math.max(2, Math.min(4, Math.round(n * 0.3))) : 4
  for (let tries = 0; tries < 12; tries++) {
    const k = 1 + Math.floor(rand() * reach)
    const v = harder ? n + k * step * (n < 10 ? 1 : 2) : n + (rand() < 0.5 ? -k : k) * step
    if (v < 2 || v === n) continue
    if (!harder && String(v).length !== digits) continue
    return v
  }
  return n + step
}

// What a number is in the exercise, from the text before (and after) it
function roleOf(before, after, squares) {
  if (/\\log\s*_\s*\{?\s*$/.test(before) || /\\sqrt\s*\[\s*$/.test(before)) return 'fixed'
  if (/\\to\s*\{?\s*-?\s*$/.test(before)) return 'fixed' // the point a limit goes to: the exercise is built around it
  if (/\\int\s*_\s*\{?\s*-?\s*$/.test(before) || /\\int\s*_\s*(?:\{[^{}]*\}|-?\d+(?:\.\d+)?)\s*\^\s*\{?\s*$/.test(before)) return 'bound'
  if (/^\s*(?:\^\s*\{?\s*\\circ|°)/.test(after)) return 'angle'
  const exp = /([\w)}])\s*\^\s*\{?\s*$/.exec(before)
  // 2^5 can change; x^2 stays (it is the kind of maths), and so do the squares of Pythagoras
  if (exp) return /\d/.test(exp[1]) && !squares ? 'power' : 'fixed'
  return 'free'
}

/**
 * The exercise with new numbers. Fractions stay proper (or improper), the same bottoms stay the
 * same and a bottom that was a multiple of another stays one (3/4 + 1/8 -> 2/5 + 1/10).
 */
export function vary(tex, rand, { harder = false, squares = false } = {}) {
  const src = String(tex)
  const nums = []
  for (const m of src.matchAll(/\d+(?:\.\d+)?/g)) {
    const before = src.slice(0, m.index)
    // a digit glued to a letter or a command is part of a name (x2, \log10): left alone
    if (/[a-zA-Z_]$/.test(before) && !/\\(?:frac|dfrac|tfrac|times|cdot|div|int|to|log|ln|sin|cos|tan)\s*$/.test(before) && !/[_^]\s*$/.test(before)) continue
    nums.push({ at: m.index, len: m[0].length, n: Number(m[0]), role: roleOf(before, src.slice(m.index + m[0].length), squares) })
  }
  if (!nums.length) return null
  const at = new Map(nums.map((x) => [x.at, x]))
  // fractions: \frac{a}{b} and a/b with whole numbers
  const fracs = []
  for (const m of src.matchAll(/\\[dt]?frac\s*\{\s*(\d+)\s*\}\s*\{\s*(\d+)\s*\}|(?<![\d.])(\d+)\s*\/\s*(\d+)(?![\d.])/g)) {
    const whole = m[0]
    const a = m[1] ?? m[3]
    const b = m[2] ?? m[4]
    const ia = m.index + whole.indexOf(a)
    const ib = m.index + whole.lastIndexOf(b)
    if (at.has(ia) && at.has(ib)) fracs.push({ top: at.get(ia), bottom: at.get(ib) })
  }
  const bottoms = new Set(fracs.map((f) => f.bottom))
  const newBottom = []
  for (const f of fracs) {
    const b = f.bottom.n
    const same = newBottom.find((x) => x.old === b)
    const base = newBottom.find((x) => x.old > 1 && b % x.old === 0 && b !== x.old)
    let v
    if (same) v = same.v
    else if (base) v = base.v * (b / base.old)
    else v = Math.max(2, nudge(b, rand, harder))
    newBottom.push({ old: b, v })
    f.bottom.v = v
  }
  for (const x of nums) {
    if (x.v !== undefined || bottoms.has(x)) continue
    if (x.role === 'fixed') x.v = x.n
    else if (x.role === 'angle') x.v = ANGLES.filter((a) => a !== x.n)[Math.floor(rand() * (ANGLES.length - 1))]
    else if (x.role === 'power') x.v = x.n <= 1 ? x.n : Math.max(2, Math.min(6, x.n + (harder ? 1 : rand() < 0.5 ? -1 : 1)))
    else x.v = nudge(x.n, rand, harder)
  }
  // a proper fraction stays proper, an improper one improper
  for (const f of fracs) {
    const { top, bottom } = f
    if (top.n < bottom.n && top.v >= bottom.v) top.v = Math.max(1, bottom.v - 1 - Math.floor(rand() * Math.min(3, bottom.v - 1)))
    if (top.n > bottom.n && top.v <= bottom.v) top.v = bottom.v + Math.max(1, top.n - bottom.n)
  }
  if (nums.every((x) => x.v === x.n)) return null
  let out = ''
  let last = 0
  for (const x of nums) {
    out += src.slice(last, x.at) + String(x.v)
    last = x.at + x.len
  }
  return out + src.slice(last)
}

// An answer as "nice" as the original's: no ≈, remainder, ∞, "no solution", fraction, decimal
// or root that it didn't have (3x + 5 = 20 has x = 5: its variants have whole-number answers too)
const FEATURES = [/\\approx/, /\\text\{\s*r\s*\}/, /\\infty/, /\\text\{\s*no\b/, /does not|doesn.t|undefined|\\pm/, /\\[dt]?frac|\d\s*\/\s*\d/, /\d\.\d/, /\\sqrt/]
function niceAs(original, variant) {
  const a = String(original?.resultTex ?? '')
  const b = String(variant?.resultTex ?? '')
  if (!b) return false
  if (FEATURES.some((re) => re.test(b) && !re.test(a))) return false
  return b.length <= Math.max(a.length + 6, 16)
}

/** A variant of an exercise that the code can still work out, with an answer like the original's. */
// A task with another word, for the reading kinds that work on one word
const WORD_TASK = { syllables: (w) => `How many syllables in ${w}?`, phonics: (w) => `How many sounds in ${w}?`, plural: (w) => `plural of ${w}`, spelling: (w, rand) => `${misspell(w, rand)} -> ${w}` }
// a likely slip to fix: a double letter written once, a silent e forgotten, two letters swapped
function misspell(w, rand) {
  const d = w.search(/([a-z])\1/)
  if (d >= 0) return w.slice(0, d) + w.slice(d + 1)
  if (/[^aeiou]e$/.test(w) && w.length > 4) return w.slice(0, -1)
  const i = 1 + Math.floor(rand() * Math.max(1, w.length - 3))
  return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)
}

export function variantOf(question, { age, seed, harder = false, avoid = new Set(), subject } = {}) {
  const original = build(question, age, subject)
  if (!original) return null
  const rand = rng(`${seed}:${question}:${harder ? 'h' : 's'}`)
  // a reading kind on one word: the same thing practised on another word
  if (WORD_KINDS.includes(original.kind) && original.word) {
    for (let tries = 0; tries < 8; tries++) {
      const w = practiceWord(original.kind, original.word, rand)
      if (!w) return null
      const text = WORD_TASK[original.kind](w, rand)
      if (avoid.has(reviewKey(text))) continue
      const sc = build(text, age)
      if (sc && sc.kind === original.kind) return { exercise: text, scene: sc, word: true }
    }
    return null
  }
  const bare = (t) => String(t ?? '').replace(/\\approx\s*/g, '').trim()
  const trivial = (t) => /^-?[01](?:\.0+)?$/.test(bare(t))
  const was = bare(original.resultTex)
  // kinds whose numbers belong together get new numbers of their own kind
  const tied = TIED[original.kind]
  if (tied) {
    for (let tries = 0; tries < 12; tries++) {
      const v = tied(question, original, rand, harder)
      if (!v || avoid.has(reviewKey(v)) || reviewKey(v) === reviewKey(question)) continue
      const sc = build(v, age, subject)
      if (sc && sc.kind === original.kind && bare(sc.resultTex) !== was) return { exercise: v, scene: sc }
    }
  }
  let fallback = null
  for (let tries = 0; tries < 24; tries++) {
    const v = vary(question, rand, { harder, squares: original.kind === 'pythagoras' })
    if (!v || avoid.has(reviewKey(v)) || reviewKey(v) === reviewKey(question)) continue
    const sc = build(v, age, subject)
    if (!sc || family(sc.kind) !== family(original.kind) || !niceAs(original, sc)) continue
    const now = bare(sc.resultTex)
    // a real new exercise has a new answer (6 × 7 -> 7 × 6 is not one), and not a give-away 0 or 1
    // (rolling an 8 with a die, 7 - 7, C(3, 3)) unless the original's was one too
    const giveAway = trivial(now) && !trivial(was)
    if (now !== was && !giveAway) return { exercise: v, scene: sc }
    if (!giveAway) fallback ??= { exercise: v, scene: sc }
  }
  return fallback
}

// New numbers for the kinds whose numbers are tied together (any other change is another kind of
// exercise): 1 + 2 + ... + n gets another n, log_2 32 another power of 2, and Pythagoras another
// right-angled triangle with whole sides (3, 4, 5 -> 6, 8, 10).
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]]
const replaceNumbers = (text, f) => {
  const out = text.replace(/(?<![\w.^]|\^\s*\{?\s*)\d+(?:\.\d+)?(?![\w.])/g, (m) => String(f(Number(m))))
  return out === text ? null : out
}
const TIED = {
  // the last number is n
  pairs: (q, sc, rand, harder) => {
    const n = nudge(sc.n, rand, harder)
    return n >= 4 && n <= 1000 ? q.replace(/(\d+)(?!.*\d)/, String(n)) : null
  },
  // log_b x: x is a power of b (another one); a power b^k: as vary does it
  powers: (q, sc, rand, harder) => {
    if (!sc.log) return null
    const k = harder ? sc.exp + 1 : Math.max(2, sc.exp + (rand() < 0.5 ? -1 : 1))
    const x = sc.base ** k
    if (k === sc.exp || x > 1e6) return null
    return q.replace(new RegExp(`(?<![\\d.])${sc.value}(?![\\d.])`), String(x))
  },
  pythagoras: (q, sc, rand, harder) => {
    const whole = [sc.a, sc.b, sc.c].every((v) => Number.isInteger(v))
    if (!whole) return null
    // as big as the original (a bit bigger for "a step further")
    const all = TRIPLES.flatMap((t) => [1, 2, 3].map((k) => t.map((v) => v * k)))
    const fits = all.filter(([, , c]) => c !== sc.c && (harder ? c > sc.c && c <= 3 * sc.c + 10 : c <= Math.max(13, 2 * sc.c)))
    if (!fits.length) return null
    const t = fits[Math.floor(rand() * fits.length)]
    const [a, b, c] = sc.a <= sc.b ? t : [t[1], t[0], t[2]]
    const to = new Map([[sc.c, c], [sc.a, a], [sc.b, b]])
    return replaceNumbers(q, (v) => to.get(v) ?? v)
  },
}

// ---------- the suggestions ----------

const WHY = {
  again: (note) => (note ? `${youSaid(note)} Try it again, one step at a time.` : 'You got a different answer on this one. Try it again, one step at a time.'),
  unfinished: () => "You didn't finish this one. Try it all the way to the answer.",
  sameWrong: (word) => `The same kind as the one that went wrong, with ${word ? 'another word' : 'new numbers'}.`,
  sameRight: (word) => `Like one you got right, with ${word ? 'another word' : 'new numbers'}: keep it fresh.`,
  question: () => 'Like the exercise you asked Glim about.',
  solved: () => 'Glim showed you how: now try it on your own.',
  harder: () => 'A step further: bigger numbers, same idea.',
}
function youSaid(note) {
  const n = String(note).trim().replace(/^you\s+/i, '').replace(/[.?!]+$/, '')
  if (!n) return ''
  // a note that is not something "you" did ("the two sides are not equal"): said as it is
  return /^(?:the|this|that|it|its|not|no|couldn|can|a|an)\b/i.test(n) ? `Last time: ${n}.` : `Last time you ${n}.`
}

// Plain maths shown as maths: 1/7 + 8/2 -> \frac{1}{7} + \frac{8}{2}, 7 x 9 or 7 * 9 -> 7 \times 9,
// 3 x -2 -> 3 \times (-2) (never "3 x - 2", which reads as 3x − 2)
function pretty(t) {
  if (/\\/.test(t) || /[a-wyzA-Z]{3,}/.test(t)) return t // already LaTeX, or words
  return t
    .replace(/(?<![\d.])(\d+)\s*\/\s*(\d+)(?![\d.])/g, '\\frac{$1}{$2}')
    .replace(/(\d)\s*[xX*×]\s*-\s*(\d+(?:\.\d+)?)/g, '$1 \\times (-$2)')
    .replace(/(\d)\s*[xX*×]\s*(?=\d)/g, '$1 \\times ')
    .replace(/\s*([+=])\s*/g, ' $1 ')
    // a minus between two numbers is a subtraction (spaced); after an operator or a bracket it
    // is the sign of the number after it (kept on it)
    .replace(/([\d)}])\s*-\s*/g, '$1 - ')
    .replace(/\s+/g, ' ')
    .trim()
}

const clean = (t, max = 160) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * The review for one session, from what was done in it:
 * lines [{ latex, verdict, note }] in the order written, questions [{ about }], and the tutor's
 * ideas [{ exercise, why }] (plain maths or LaTeX). 3 to 5 exercises when there is enough to go
 * on; each { id, exercise (LaTeX), level, why, kind, answer (LaTeX, or null), scene }.
 */
export function suggestReview({ seed = '', lines = [], questions = [], ideas = [], solved = [], subject = 'maths', age = null } = {}) {
  const items = []
  const seen = new Set()
  const add = (level, exercise, why, scene, from) => {
    // the exercise as the animation reads it (an integral sign the camera read as S, fixed)
    // a word to spell or a sentence to correct is shown as the task, without the answer in it
    const task = scene?.kind === 'spelling' ? `Fix the spelling: ${scene.attempt ?? scene.word}` : scene?.kind === 'sentence' ? `Correct the sentence: ${scene.original}` : null
    const shown = task ?? pretty(typeof scene?.exerciseTex === 'string' && scene.exerciseTex.trim() ? scene.exerciseTex.trim() : untext(unwrap(exercise)))
    // one exercise once, whether it is told by what was written or by what is shown
    const k = reviewKey(exercise)
    const ks = reviewKey(shown)
    if (!k || seen.has(k) || seen.has(ks) || items.length >= REVIEW_MAX) return false
    seen.add(k)
    seen.add(ks)
    items.push({ id: hash(`${level}:${k}`).toString(36), exercise: shown, level, why: clean(why), kind: scene?.kind ?? null, answer: scene?.resultTex ? String(scene.resultTex) : null, scene: scene ?? null, ...(from ? { from: unwrap(from) } : {}) })
    return true
  }
  const variant = (q, harder) => variantOf(q, { age, seed, harder, avoid: seen, subject })

  // the student's exercises, newest first, each once: what went wrong, what wasn't finished,
  // what was asked about, what was right
  const done = new Set()
  const sources = []
  const push = (written, type, note) => {
    const latex = untext(unwrap(written)) // \text{6 x 7 = 48}: the line the reader kept as words
    if (isResult(latex)) return // a result written down: nothing to practise
    const question = questionOf(latex, age)
    const k = reviewKey(question)
    if (!k || done.has(k)) return
    done.add(k)
    // only what the code can work out: a line the camera misread ("t × 9", "Decision ①②") is left out
    const scene = build(question, age, subject)
    // varied as the animation reads it (S_0^4 read by the camera is \int_0^4)
    const read = typeof scene?.exerciseTex === 'string' && scene.exerciseTex.trim() ? scene.exerciseTex.trim() : question
    if (scene) sources.push({ question: read, type, note, scene, from: latex })
  }
  const written = [...lines].reverse().filter((l) => l && l.latex && l.verdict !== 'reading')
  for (const l of written) if (l.verdict === 'wrong') push(l.latex, 'wrong', l.note)
  for (const l of written) if (l.verdict === 'unsure') push(l.latex, 'unsure', l.note)
  for (const q of [...questions].reverse()) if (q?.about) push(q.about, 'question')
  // exercises solved with an animation (a word the tutor corrected: "becaus -> because")
  for (const text of [...solved].reverse()) if (text) push(text, 'solved')
  for (const l of written) if (l.verdict === 'correct') push(l.latex, 'right')

  // 1. one for each exercise of the day
  for (const s of sources) {
    if (s.type === 'wrong') add('again', s.question, WHY.again(s.note), s.scene, s.from)
    else if (s.type === 'unsure') add('again', s.question, WHY.unfinished(), s.scene, s.from)
    else if (s.type === 'solved') add('again', s.question, WHY.solved(), s.scene, s.from)
    else {
      const v = s.scene && variant(s.question)
      if (v) add('same', v.exercise, s.type === 'question' ? WHY.question() : WHY.sameRight(v.word), v.scene, s.from)
    }
  }
  // 2. the tutor's ideas the code can check
  const checked = []
  for (const idea of ideas) {
    const text = clean(idea?.exercise, 200)
    if (!text) continue
    const question = questionOf(/\\/.test(text) ? text : plainToTex(text), age)
    const sc = build(question, age)
    if (sc) add('idea', question, idea.why || 'Glim picked this one for you.', sc)
    else checked.push({ question, why: idea.why })
  }
  // 3. new numbers for what went wrong, then a step further for what was right
  for (const s of sources)
    if (s.scene && (s.type === 'wrong' || s.type === 'unsure' || s.type === 'solved')) {
      const v = variant(s.question)
      if (v) add('same', v.exercise, WHY.sameWrong(v.word), v.scene, s.from)
    }
  for (const s of sources)
    if (items.length < REVIEW_MIN + 1 && s.scene && (s.type === 'right' || s.type === 'question')) {
      const v = WORD_KINDS.includes(s.scene.kind) ? null : variant(s.question, true) // a word has no "harder"
      if (v) add('harder', v.exercise, WHY.harder(), v.scene, s.from)
    }
  // a session with one exercise: a step further on it too, once it has been tried again
  for (const s of sources)
    if (items.length < REVIEW_MIN && s.scene) {
      const v = WORD_KINDS.includes(s.scene.kind) ? null : variant(s.question, true) // a word has no "harder"
      if (v) add('harder', v.exercise, WHY.harder(), v.scene, s.from)
    }
  // 4. still too few: the tutor's ideas without a checked answer, then the day's exercises again
  for (const c of checked) if (items.length < REVIEW_MIN) add('idea', c.question, c.why || 'Glim picked this one for you.', null)
  for (const s of sources) if (items.length < REVIEW_MIN && s.type !== 'wrong' && s.type !== 'unsure') add('again', s.question, 'One from today, to do again without looking.', s.scene, s.from)
  return items
}
