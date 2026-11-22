// The Glimpse engine (docs/protocol.md), as a pure step function:
//   state' = await handle(state, clientEvent, emit)
// State is plain JSON so it can live in a database between serverless calls; `emit` sends
// engine events back (streamed over HTTP, or a WebSocket).
import { F, toPlain, parseSum, plainToLatex, checkSum, checkEquation, diagnose, BUGS, reduce, fstr, sumLatex, evaluate, lcm } from './maths.js'
import { explainWrongSum, chooseStyle, similarExercises, hint, styleNames, exerciseId } from './teach.js'
import { readFrame, stripMath } from './reader.js'
import { decodeJpeg, drawRing, resizeRgba, toJpegBase64 } from '../images.js'
import { complete } from '../llm.js'
import { sceneFor, texToPlain, compile, toExpr } from './scenes.js'
import { REVIEW_VERSION, suggestReview } from './review.js'
import { DOMAIN_KINDS, SUBJECT_OF } from './domains.js'

export const ENGINE_VERSION = 'hackathon-engine-1'

// What the child hears when a model can't be reached (the reason is logged, not shown).
const TROUBLE = {
  read: { text: "I couldn't read your paper just now. Please try again in a moment.", lang: 'en' },
  think: { text: "I'm having trouble thinking right now. Please try again in a moment.", lang: 'en' },
}

const LANG_NAME = { fr: 'French', en: 'English', de: 'German', it: 'Italian', tr: 'Turkish', ar: 'Arabic' }
const ASK_DEFAULT = { fr: 'pourquoi c’est faux ?', en: 'why is this wrong?', de: 'warum ist das falsch?', it: 'perché è sbagliato?' }

export function newState({ id, student, name, lang = 'en', subject = 'maths', age = null }) {
  return {
    id,
    student,
    name,
    lang,
    subject,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    ended: false,
    nextPartId: 1,
    parts: [], // WrittenPart (+ plain) as sent to the web
    readKeys: [], // { partId, key } lines already read (their maths, normalized)
    sheets: [], // the camera's sheets of paper: the part ids on each, top to bottom
    sheet: 0, // the sheet the camera read last
    paperQuad: null,
    awaiting: null, // part waiting for "Did you write this?"
    profile: {}, // style -> { tries, wins }
    misconceptions: {}, // id -> { id, name, seen, status, styles[] }
    lastTeach: null, // { style, misconceptionId, partId } waiting for the next attempt
    exercises: [],
    currentExerciseId: null,
    seenExercises: [],
    streak: 0,
    questions: [],
    age, // years; decides how the animations look and how simply Glim talks
    history: [], // records waiting to be saved to the database (server/store.js)
    ai: { localReads: 0, bigCalls: 0, cost: 0 },
  }
}

const say = (s, key, slots) => hint(key, s.lang, slots)
// A simplified answer as the child would write it: 2/2 -> "1" (not "1/1"), 6/4 -> "3/2".
const fshow = (f) => (f.d === 1 ? String(f.n) : fstr(f))
// "a/b + c/d = anything": an attempt at a fraction sum, also when answered with a whole number (1/4+3/4=1).
const fractionAttempt = (plain) => /^\d+\/\d+\+\d+\/\d+=[^=]+$/.test(String(plain || ''))
// A typed line is one line of maths: longer text is cut (it is stored, and echoed in hints).
const MAX_TYPED = 300
const echo = (t) => {
  const x = plainReply(t)
  return x.length > 60 ? `${x.slice(0, 57)}…` : x
}

// `crop` (the camera's picture of this line) is sent once, with the first version of the
// part, and not stored, so sessions stay small in the database.
function putPart(s, part, emit, crop) {
  const { crop: _c, ...stored } = part
  const i = s.parts.findIndex((p) => p.id === part.id)
  if (i >= 0) s.parts[i] = stored
  else s.parts.push(stored)
  const { plain, raw, ...web } = stored
  emit({ type: 'part', part: crop ? { ...web, crop } : web })
}

function publicExercises(list) {
  return list.map(({ id, latex, target }) => ({ id, latex, ...(target ? { target } : {}) }))
}

function offerExercises(s, emit, { bug = null, harder = false } = {}) {
  const items = similarExercises({ bug, harder, seen: new Set(s.seenExercises) }).map(({ id, latex, target }) => ({ id, latex, target }))
  s.exercises = items
  s.currentExerciseId = items[0]?.id ?? null
  emit({ type: 'exercises', items: publicExercises(items), ...(s.currentExerciseId ? { currentId: s.currentExerciseId } : {}) })
}

// ---------- judging one line ----------

// Fixed: if the mistake comes back, the teaching starts again, with the style that worked first.
function fixMisconception(m) {
  m.status = 'fixed'
  m.styles = []
}

function judge(s, part, emit) {
  const plain = part.plain
  const sum = parseSum(plain)
  // the next attempt after a teaching tells us if that style worked
  const settleTeaching = (right) => {
    if (!s.lastTeach) return null
    const { style, misconceptionId } = s.lastTeach
    const p = s.profile[style] || { tries: 0, wins: 0 }
    s.profile[style] = { tries: p.tries + 1, wins: p.wins + (right ? 1 : 0) }
    if (right && s.misconceptions[misconceptionId]) fixMisconception(s.misconceptions[misconceptionId])
    s.lastTeach = null
    emit({ type: 'profile', profile: s.profile })
    return right ? style : null
  }
  // every judged line is saved to the history, like the lines the camera reads
  const record = (h) => {
    const p = s.parts.find((x) => x.id === part.id)
    if (p) remember(s, { kind: 'line', ref: `line:${p.id}`, data: { partId: p.id, latex: p.latex, verdict: p.verdict, note: p.note ?? null, hint: h?.text ?? null, photo: null } })
  }

  if (sum) {
    const id = exerciseId(sum.a, sum.b)
    if (!s.seenExercises.includes(id)) s.seenExercises.push(id)
    if (s.exercises.some((e) => e.id === id)) part.exerciseId = id
    const verdict = checkSum(sum.a, sum.b, sum.ans)
    if (verdict !== 'wrong') {
      const simple = reduce(sum.ans)
      putPart(s, { ...part, verdict: 'correct', ...(verdict === 'unsimplified' ? { note: `also ${fshow(simple)}` } : {}) }, emit)
      s.streak += 1
      const clicked = settleTeaching(true)
      emit({ type: 'teach', teaching: null })
      const h = clicked
        ? say(s, 'clicked', { style: styleNames(clicked) })
        : verdict === 'unsimplified'
          ? say(s, 'right_unsimplified', { ans: fstr(sum.ans), simple: fshow(simple) })
          : say(s, s.streak === 2 ? 'streak' : 'right') // "Two in a row!" once, not on every later line
      emit({ type: 'hint', hint: h })
      offerExercises(s, emit, { harder: s.streak >= 2 })
      record(h)
      return
    }
    // wrong
    s.streak = 0
    settleTeaching(false)
    const bug = diagnose(sum.a, sum.b, sum.ans)[0] || null
    const mid = bug?.id || 'unknown'
    const m = (s.misconceptions[mid] ||= { id: mid, name: bug?.name || 'Not the right total', seen: 0, status: 'working', styles: [] })
    m.seen += 1
    m.status = 'working'
    const iteration = m.styles.length + 1
    const { style, why } = chooseStyle(s.profile, iteration, m.styles)
    m.styles.push(style)
    const { teaching, hint: h } = explainWrongSum({ partId: part.id, a: sum.a, b: sum.b, ans: sum.ans, bug, style, why, iteration, lang: s.lang })
    s.lastTeach = { style, misconceptionId: mid, partId: part.id }
    putPart(s, { ...part, verdict: 'wrong', note: bug?.label || 'not the right total' }, emit)
    emit({ type: 'teach', teaching })
    emit({ type: 'hint', hint: h })
    offerExercises(s, emit, { bug })
    record(h)
    return
  }

  const eq = checkEquation(plain)
  let h
  if (eq === true) {
    s.streak += 1
    putPart(s, { ...part, verdict: 'correct' }, emit)
    // a taught fraction sum fixed with a whole-number answer (1/4 + 3/4 = 1) shows the style worked
    const clicked = fractionAttempt(plain) ? settleTeaching(true) : null
    emit({ type: 'teach', teaching: null })
    h = clicked ? say(s, 'clicked', { style: styleNames(clicked) }) : say(s, s.streak === 2 ? 'streak' : 'right')
  } else if (eq === false) {
    s.streak = 0
    if (fractionAttempt(plain)) settleTeaching(false)
    putPart(s, { ...part, verdict: 'wrong', note: 'the two sides are not equal' }, emit)
    h = say(s, 'wrong_generic')
  } else {
    putPart(s, { ...part, verdict: 'unsure', note: "couldn't check this line" }, emit)
    h = say(s, 'not_maths', { text: echo(part.raw || part.latex) })
  }
  emit({ type: 'hint', hint: h })
  record(h)
}

// A new written line (from the camera or typed): show it, then judge or ask to confirm.
function addLine(s, { raw, box, key, crop }, emit) {
  const plain = toPlain(raw)
  const sum = parseSum(plain)
  const checkable = sum || checkEquation(plain) !== null
  const latex = plain ? plainToLatex(plain) : stripMath(raw)
  const part = { id: s.nextPartId++, latex, plain, raw, confidence: checkable ? 0.93 : 0.55, verdict: 'reading', at: Date.now(), ...(box ? { box } : {}) }
  if (key) (s.readKeys ||= []).push({ partId: part.id, key })
  putPart(s, part, emit, crop)
  if (!checkable && plain) {
    // The reader isn't sure what it read: ask the child (cheaper than a big model).
    s.awaiting = part.id
    emit({ type: 'confirm', partId: part.id, latex })
    emit({ type: 'status', state: 'watching' })
    return
  }
  emit({ type: 'status', state: 'thinking' })
  judge(s, part, emit)
  emit({ type: 'status', state: 'watching' })
}

// ---------- whole-page analysis by the LLM ----------
//
// GLM-OCR transcribes the whole photo; the tutor LLM gets the photo + that transcription.
// The transcription is what was written (the LLM doesn't re-read it: seen live, it "fixed" a
// correct 1 into a 4); the LLM sorts the lines (student's work vs printed), judges them and
// writes the feedback. Exact checking has the last word on fraction sums and arithmetic, and a
// wrong fraction sum gets a computed picture (pies / bars / worked example).

// (the example has no numbers of its own: models copied "halves and thirds" from a worked
// example into hints about 2/5 + 1/3)
const TUTOR_INTRO = `You are Glim, a kind, patient maths tutor. The student is often a child: use short, simple words and match the level of the maths on the page.
Be really helpful and concrete: use the actual numbers and expressions from the page, never numbers from somewhere else. A hint gives the next step: the rule or fact to use and how it applies here, so the student can do that step; the full solution is shown separately, step by step.
Example, for a sum of two fractions with different bottoms:
- good hint: the rule, then the student's own fractions: "These pieces are different sizes, so make the bottoms the same first: <the first fraction> = <the same fraction with the common bottom>. What is <the second fraction> with that bottom?"
- bad hint (too vague): "Think about fractions."`

// The same tutor for the other subjects on the desk ("Choose a practice")
const SUBJECT_INTRO = {
  maths: TUTOR_INTRO,
  reading: `You are Glim, a kind, patient reading and writing tutor. The student is often a child: use short, simple words. Help with spelling, the sounds and syllables of words, plurals, capital letters and punctuation, and questions about a text. Be concrete: use the actual words from the page.
Example, for the word "becaus":
- good hint: "Nearly! Say it slowly: be-cause. Which letter do you see at the very end of 'cause'?"
- bad hint (too vague): "Check your spelling."`,
  science: `You are Glim, a kind, patient science tutor. The student is often a child: use short, simple words and everyday examples. Help with units and conversions, speed, floating and sinking (density), electric circuits, solids, liquids and gases, living things and food chains. Be concrete: use the actual numbers and units from the page, and always write the units.
Example, for "A car drives 120 km in 2 hours. Speed = 240":
- good hint: "Speed is distance divided by time. How far does the car go in ONE hour?"
- bad hint (too vague): "Think about speed."`,
}
const tutorIntro = (s) => SUBJECT_INTRO[s.subject] ?? TUTOR_INTRO
const SUBJECT_NAME = { maths: 'maths', reading: 'reading and writing', science: 'science' }
const SUBJECT_WORK = { maths: "the student's maths", reading: "the student's writing: words, sentences, answers", science: "the student's work: answers, calculations, labels" }
const SUBJECT_CHECK = {
  maths: '',
  reading: '\nIn reading, "correct" means spelt and punctuated right; "wrong" means a spelling, capital letter, punctuation or grammar mistake (the note says which).',
  science: '\nIn science, check the numbers, the units and the facts: a missing or wrong unit is a mistake.',
}
// how the worked solution starts, per subject (sendSteps)
const SOLVE_INTRO = {
  maths: 'You are Glim, a maths tutor. Solve the exercise completely and correctly, step by step, the way you would show it to a student on the board: 3 to 6 steps.',
  reading: 'You are Glim, a reading and writing tutor. Correct or answer the exercise step by step, the way you would show it to a student: 2 to 5 steps (the rule, then how it applies here). For a word, "result" is the word spelt correctly, only the word; for a sentence, the corrected sentence; for a question, the answer.',
  science: 'You are Glim, a science tutor. Solve or explain the exercise completely and correctly, step by step: 3 to 6 steps, with the units at every step. "result" is the answer with its unit.',
}

const PAGE_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' },
          kind: { type: 'string', enum: ['work', 'printed'] },
          verdict: { type: 'string', enum: ['correct', 'wrong', 'unfinished', 'unsure'] },
          note: { type: 'string' },
        },
        required: ['n', 'kind', 'verdict'],
      },
    },
    feedback: { type: 'string' },
    feedback_en: { type: 'string' },
  },
  required: ['lines', 'feedback'],
}

// Replies are shown as text and read aloud: one paragraph, no $...$ markers, no LaTeX commands
// (a model sometimes writes \frac{1}{1+x} anyway: it becomes 1/(1+x)).
function plainReply(t) {
  let s = String(t || '').replace(/\$+([^$]*)\$+/g, '$1')
  if (/\\[a-zA-Z]/.test(s)) s = texToPlain(s.replace(/\\[()[\]]/g, ' '))
  return s.replace(/\s*\n+\s*/g, ' ').trim()
}
// The reply in a structured answer. The raw JSON is never shown or read aloud: when the model
// answered in JSON without the expected field, there is no reply ('').
function replyText(out, ...keys) {
  const j = out?.json
  if (j && typeof j === 'object') {
    for (const k of keys) if (typeof j[k] === 'string' && j[k].trim()) return j[k]
    return ''
  }
  const text = String(out?.text || '').trim()
  return /^[{[]/.test(text) ? '' : text
}
// A small copy of the photo for the history (the full frame would fill the database).
function thumbnail(dataUrl, width = 480) {
  try {
    if (!dataUrl) return null
    const img = decodeJpeg(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
    return `data:image/jpeg;base64,${toJpegBase64(resizeRgba(img, width), 72)}`
  } catch {
    return null
  }
}
// How alike two lines are, 0-1 (edit distance), to tell "the same page, read again" from a new one.
function similarity(a, b) {
  if (!a || !b) return 0
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length)
}
const numbered = (lines) => lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
const looksMathy = (l) => /\d/.test(l) && /[+\-=×÷*/^_]|\\[a-z]+/.test(l)
// in reading and science, any written line is work (not headings like "Name:" or "Exercise 2")
const looksWritten = (l) => /[A-Za-z0-9]{2,}/.test(l) && !/^\s*(name|date|class|page|exercise|question|chapter|unit)\b\s*[:\d]/i.test(l)
const looksWork = (s, l) => (s.subject && s.subject !== 'maths' ? looksWritten(l) : looksMathy(l))

// ---------- which line of the paper is which ----------
//
// The camera reads the whole sheet each time. Each line read is matched to a line already on that
// sheet by its maths, not by its position: the OCR sometimes misses a line, or writes the same line
// differently ($6 × 7$ / 6 \times 7), and a new sheet must never replace the lines of an earlier one.

// A line's maths, normalised so OCR formatting doesn't matter.
function lineNorm(t) {
  const key =
    toPlain(t) ||
    String(t || '')
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\times|×|\\cdot|·/g, '*')
      .replace(/\\div|÷/g, '/')
      .replace(/[−–]/g, '-')
      .replace(/\$|\\[()[\]]|\\(?:left|right|displaystyle|quad|[,;!])|\s|[{}]/g, '')
      .toLowerCase()
  return key || String(t || '').trim().toLowerCase()
}
const lhsOf = (key) => {
  const i = key.indexOf('=')
  return i > 0 ? key.slice(0, i) : ''
}
// 3: the same line; 2: the same exercise (answer corrected or added, or the line continued);
// 1.x: the same line with an OCR slip; 0: another line.
function lineMatch(a, b) {
  if (!a || !b) return 0
  if (a === b) return 3
  const la = lhsOf(a)
  if (la && la === lhsOf(b)) return 2
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  if (short.length >= 3 && long.startsWith(short)) return 2
  const sim = similarity(a, b)
  return sim >= 0.8 ? 1 + sim / 10 : 0
}
// Lines read (keys, top to bottom) -> the index of the stored line each one is, or -1 (a new line).
// The order is kept (an alignment, like a diff).
function alignLines(keys, stored) {
  const n = keys.length
  const m = stored.length
  const score = keys.map((k) => stored.map((t) => lineMatch(k, t)))
  const best = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], score[i][j] ? score[i][j] + best[i + 1][j + 1] : 0)
  const match = new Array(n).fill(-1)
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (score[i][j] && best[i][j] === score[i][j] + best[i + 1][j + 1]) match[i++] = j++
    else if (best[i][j] === best[i + 1][j]) i++
    else j++
  }
  // Between two matched lines (or above the first one), as many lines read as stored: the same
  // lines, read with bigger slips (17/9 read as 4/9). Below the last match a line read can be new.
  let pi = -1
  let pj = -1
  for (let i = 0; i < n; i++) {
    if (match[i] < 0) continue
    if (i - pi === match[i] - pj && i - pi > 1)
      for (let k = 1; k < i - pi; k++) if (similarity(keys[pi + k], stored[pj + k]) >= 0.4) match[pi + k] = pj + k
    pi = i
    pj = match[i]
  }
  return match
}
const partKey = (p) => lineNorm(p.raw || p.latex)

// The sheet this read is from: the current one, an earlier one it shares lines with, or a new one.
function pickSheet(s, keys) {
  if (!Array.isArray(s.sheets)) {
    // a session saved before sheets were kept: its lines, split where the last new page began
    const ids = s.parts.map((p) => p.id)
    const start = s.pageStart || 0
    s.sheets = start ? [ids.filter((id) => id <= start), ids.filter((id) => id > start)] : ids.length ? [ids] : []
    s.sheet = Math.max(0, s.sheets.length - 1)
  }
  const sheets = s.sheets.map((ids, index) => {
    const stored = ids.map((id) => s.parts.find((p) => p.id === id)).filter(Boolean)
    const skeys = stored.map(partKey)
    const match = alignLines(keys, skeys)
    const strength = (min) => match.filter((j, i) => j >= 0 && lineMatch(keys[i], skeys[j]) >= min).length
    return { index, stored, skeys, match, strong: strength(2), slips: strength(1) }
  })
  const cur = sheets[s.sheet] ?? sheets[sheets.length - 1]
  if (cur && !cur.stored.length) return cur
  if (cur) {
    const other = sheets.filter((x) => x.strong > cur.strong).sort((a, b) => b.strong - a.strong)[0]
    if (other) return other // back to an earlier sheet
    if (cur.strong) return cur
    // nothing in common: a new sheet, unless most lines are the current sheet's read with a slip
    if (cur.slips && cur.slips >= Math.ceil(Math.min(keys.length, cur.stored.length) / 2)) return cur
  }
  s.sheets.push([])
  return { index: s.sheets.length - 1, stored: [], skeys: [], match: keys.map(() => -1), strong: 0, slips: 0 }
}

// 'correct' | 'wrong' when the line can be checked exactly (fraction sums, arithmetic), else null.
function exactVerdict(plain) {
  const sum = parseSum(plain || '')
  if (sum) return checkSum(sum.a, sum.b, sum.ans) === 'wrong' ? 'wrong' : 'correct'
  const eq = plain ? checkEquation(plain) : null
  return eq === null ? null : eq ? 'correct' : 'wrong'
}
function rightHint(s, plain) {
  const sum = parseSum(plain || '')
  const v = sum && checkSum(sum.a, sum.b, sum.ans)
  if (v === 'unsimplified') return say(s, 'right_unsimplified', { ans: fstr(sum.ans), simple: fshow(reduce(sum.ans)) })
  // different bottoms: what was done, computed (never the model's words about "the tops and the bottoms")
  if (v === 'correct' && sum.a.d !== sum.b.d) {
    const d = lcm(sum.a.d, sum.b.d)
    return say(s, 'right_common', { a: fstr(sum.a), b: fstr(sum.b), as: fstr(F(sum.a.n * (d / sum.a.d), d)), bs: fstr(F(sum.b.n * (d / sum.b.d), d)), sum: fstr(F(sum.a.n * (d / sum.a.d) + sum.b.n * (d / sum.b.d), d)) })
  }
  return say(s, 'right')
}

// ---------- equations solved line by line ----------
//
// An equation in one letter that is linear (3x + 4x = 400, 5x = 400, x = 80): its solution, worked
// out by evaluating both sides (no algebra system), or null. solved: the line is the answer (x = 80).
function linearRoot(line) {
  let e
  try {
    e = toExpr(stripMath(String(line || ''))).replace(/\s+/g, '')
  } catch {
    return null
  }
  const sides = e.split('=')
  if (sides.length !== 2 || !sides[0] || !sides[1]) return null
  const letters = [...new Set(e.match(/[a-zA-Z]+/g) || [])]
  if (letters.length !== 1 || letters[0].length !== 1) return null
  const v = letters[0]
  try {
    const L = compile(sides[0], [v])
    const R = compile(sides[1], [v])
    const g = (x) => L(x) - R(x)
    const g0 = g(0)
    const a = g(1) - g0
    const fits = [2, -3, 0.5, 7].every((x) => Math.abs(g(x) - (a * x + g0)) <= 1e-9 * Math.max(1, Math.abs(g(x)), Math.abs(a * x), Math.abs(g0)))
    if (!fits || !Number.isFinite(a) || Math.abs(a) < 1e-12) return null
    const solved = sides.some((x) => x === v) && sides.some((x) => !x.includes(v))
    return { v, x: -g0 / a, solved }
  } catch {
    return null
  }
}
// The model can call a step right that changes the answer (seen live: 3x + 4x = 400, then
// 5x = 400 marked right). Each new line of an equation is checked against the line above it, for
// the same x: a line whose solution is not the one above is a slip, and the lines after it, which
// follow from it, carry the slip (x = 80 is not the answer to 3x + 4x = 400). A line that is the
// answer (x = 80) ends the exercise: the next one starts another.
// -> partId -> { exercise (its first line: what the steps solve), carried } for the lines marked so
function checkSteps(read1) {
  const same = (p, q) => Math.abs(p - q) <= 1e-6 * Math.max(1, Math.abs(p), Math.abs(q))
  const slips = new Map()
  let chain = null // { v, first, prev, text }: the solutions of the exercise's first line and of the line above
  for (const r of read1) {
    const root = r.part.plain && exactVerdict(r.part.plain) !== null ? null : linearRoot(r.part.raw || r.part.latex)
    // a numbered line ("2) 3x - 1 = 8") is another exercise
    if (!root || /^\s*(?:\(?\d{1,2}[.)]|\(?[a-h]\)|q\s*\d+\s*[:.)])\s+/i.test(stripMath(r.part.raw || r.part.latex))) chain = null
    if (!root) continue
    // only the model's "correct" is overruled (a line it was unsure of may be another exercise)
    if (chain && chain.v === root.v && r.changed) {
      if (!same(root.x, chain.prev)) {
        if (r.part.verdict === 'correct') r.part = { ...r.part, verdict: 'wrong', note: "made a slip: this line doesn't follow from the line above" }
        if (r.part.verdict === 'wrong') slips.set(r.part.id, { exercise: chain.text, carried: false })
      } else if (!same(root.x, chain.first) && r.part.verdict === 'correct') {
        r.part = { ...r.part, verdict: 'wrong', note: 'carried on a slip from a line above' }
        slips.set(r.part.id, { exercise: chain.text, carried: true })
      }
    }
    chain = root.solved ? null : chain && chain.v === root.v ? { ...chain, prev: root.x } : { v: root.v, first: root.x, prev: root.x, text: r.part.raw || r.part.latex }
  }
  return slips
}
// "line 2" in the tutor's words is a line of the OCR transcript, which also has printed lines:
// said with the number the student sees on the line (its part id), or not at all
function renumber(text, ids) {
  return String(text || '').replace(/\b(lines?)\s+(\d+)((?:\s*(?:,|and|&)\s*\d+)*)/gi, (m, word, first, rest) => {
    const nums = [first, ...(rest.match(/\d+/g) || [])].map((n) => ids.get(Number(n)))
    if (nums.some((n) => n === undefined)) return m
    return `${word} ${nums.length > 1 ? `${nums.slice(0, -1).join(', ')} and ${nums.at(-1)}` : nums[0]}`
  })
}

async function analyzePage(s, read, frameDataUrl, emit) {
  const lang = LANG_NAME[s.lang] ? s.lang : 'en'
  if (!read.lines.length) {
    emit({ type: 'hint', hint: say(s, 'no_new_line') })
    return
  }
  // OCR reads top to bottom: the newest line is (usually) the last line with maths in it
  const newest = read.lines.findLastIndex((l) => looksWork(s, l))
  let out
  try {
    out = await complete('tutor', {
      messages: [
        {
          role: 'system',
          content: `${tutorIntro(s)}
You get a photo of the student's paper and its transcription by an OCR model, line by line. The transcription is what is written: do not re-read or correct it. Use the photo only to see the layout (what is handwritten, what is printed, what belongs together).
For every transcribed line return:
- "n": its number;
- "kind": "work" (${SUBJECT_WORK[s.subject] ?? SUBJECT_WORK.maths}) or "printed" (headings, names, page numbers, printed instructions);
- "verdict": "correct", "wrong", "unfinished" (it ends with "=" or has no result yet) or "unsure" (it can't be checked);
- "note", only when wrong: the mistake, short, phrased to follow "you", e.g. "forgot to carry the ten".${SUBJECT_CHECK[s.subject] ?? ''}
For a line that carries on the line above (the next step of the same exercise), check that it follows from it: the same answer must still be true.
Then "feedback": what Glim says to the student about their LAST line of work, in ${LANG_NAME[lang]}, at most 2 short sentences.
- correct: say so briefly, and what could come next;
- wrong: say what went wrong and how to fix it;
- unfinished: the next step, concretely: the rule or fact to use and how it applies to this line, with its own numbers.
Write maths in the feedback as plain text that can be read aloud (e.g. x², 3/4), not LaTeX. Don't mention line numbers (the student doesn't see the transcript's numbers): quote the maths instead.${lang !== 'en' ? '\nAlso "feedback_en": the same in English.' : ''}`,
        },
        { role: 'user', content: `OCR transcription of the paper:\n${numbered(read.lines)}${newest >= 0 ? `\n\nThe student's newest line is the lowest one they wrote: probably line ${newest + 1}, "${read.lines[newest]}". The feedback is about that line only.` : ''}`, images: [read.image] },
      ],
      schema: PAGE_SCHEMA,
      maxTokens: 900,
      temperature: 0.2,
    })
    s.ai.bigCalls += 1
  } catch (err) {
    console.warn('[engine] tutor model:', err.message)
    emit({ type: 'hint', hint: { ...TROUBLE.think } }) // the reason is logged, never sent to the browser
    return
  }
  const judged = Array.isArray(out.json?.lines) ? out.json.lines : []
  const work = []
  read.lines.forEach((line, i) => {
    const j = judged.find((l) => l?.n === i + 1)
    const kind = j?.kind || (looksWork(s, line) ? 'work' : 'printed')
    if (kind === 'work') work.push({ line, j, n: i + 1 })
  })
  if (!work.length) {
    emit({ type: 'hint', hint: say(s, 'no_new_line') })
    return
  }
  // which sheet, and which of its lines each line read is (new lines get new ids)
  const keys = work.map(({ line }) => lineNorm(line))
  const sheet = pickSheet(s, keys)
  s.sheet = sheet.index
  const order = []
  let next = 0 // the stored lines up to here are placed
  const read1 = work.map(({ line, j }, i) => {
    const mi = sheet.match[i]
    const prev = mi >= 0 ? sheet.stored[mi] : null
    const placeUpTo = mi >= 0 ? mi + 1 : (sheet.match.slice(i + 1).find((x) => x >= 0) ?? sheet.stored.length)
    for (; next < placeUpTo; next++) order.push(sheet.stored[next].id)
    const plain = toPlain(line)
    const sum = parseSum(plain)
    if (sum) {
      const id = exerciseId(sum.a, sum.b) // not offered again as a "similar" exercise
      if (!s.seenExercises.includes(id)) s.seenExercises.push(id)
    }
    // the same maths as before (maybe written differently by the OCR): the line is kept as it was
    if (prev && partKey(prev) === keys[i]) return { part: prev, j, changed: false }
    let verdict = j?.verdict === 'correct' || j?.verdict === 'wrong' ? j.verdict : 'unsure'
    let note = verdict === 'wrong' && typeof j?.note === 'string' ? j.note : j?.verdict === 'unfinished' ? 'not finished yet' : undefined
    // exact checking overrides the model on what it can check (and the note is computed too: the
    // model's guess at the mistake can be about something else)
    if (sum) {
      const v = checkSum(sum.a, sum.b, sum.ans)
      verdict = v === 'wrong' ? 'wrong' : 'correct'
      note = verdict === 'wrong' ? diagnose(sum.a, sum.b, sum.ans)[0]?.label || 'not the right total' : undefined
    } else if (plain && checkEquation(plain) !== null) {
      verdict = checkEquation(plain) ? 'correct' : 'wrong'
      note = verdict === 'wrong' ? 'the two sides are not equal' : undefined
    }
    const id = prev ? prev.id : s.nextPartId++
    if (!prev) order.push(id)
    const exId = sum && exerciseId(sum.a, sum.b)
    const part = { id, latex: stripMath(line), plain, raw: line, confidence: 0.9, verdict, ...(note ? { note } : {}), at: prev?.at ?? Date.now(), ...(exId && s.exercises.some((e) => e.id === exId) ? { exerciseId: exId } : {}) }
    return { part, j, changed: true }
  })
  for (; next < sheet.stored.length; next++) order.push(sheet.stored[next].id)
  s.sheets[sheet.index] = order
  const slips = checkSteps(read1)

  const last = read1[read1.length - 1].part // the newest line: what the tutor's feedback is about
  const changed = read1.filter((x) => x.changed).map((x) => x.part)
  const focus = changed[changed.length - 1] ?? null // what the student just wrote or corrected
  // new and corrected lines carry the photo they were read from ("What the camera saw")
  const thumb = thumbnail(frameDataUrl)
  for (const { part, changed: isNew } of read1) putPart(s, part, emit, isNew ? (part === focus ? frameDataUrl : thumb || undefined) : undefined)

  // every new wrong fraction sum counts for its misconception; the teaching is for the newest one
  const diagnosed = new Map()
  for (const part of changed) {
    const sum = parseSum(part.plain || '')
    if (part.verdict !== 'wrong' || !sum) continue
    const bug = diagnose(sum.a, sum.b, sum.ans)[0] || null
    const mid = bug?.id || 'unknown'
    const m = (s.misconceptions[mid] ||= { id: mid, name: bug?.name || 'Not the right total', seen: 0, status: 'working', styles: [] })
    m.seen += 1
    m.status = 'working'
    diagnosed.set(part.id, { bug, mid, m, sum })
  }
  let teachHint = null
  if (focus) {
    const d = diagnosed.get(focus.id)
    if (d) {
      if (s.lastTeach) {
        const p = s.profile[s.lastTeach.style] || { tries: 0, wins: 0 }
        s.profile[s.lastTeach.style] = { tries: p.tries + 1, wins: p.wins }
      }
      const { style, why } = chooseStyle(s.profile, d.m.styles.length + 1, d.m.styles)
      d.m.styles.push(style)
      const { teaching, hint: h } = explainWrongSum({ partId: focus.id, a: d.sum.a, b: d.sum.b, ans: d.sum.ans, bug: d.bug, style, why, iteration: d.m.styles.length, lang: s.lang })
      teachHint = h
      s.lastTeach = { style, misconceptionId: d.mid, partId: focus.id }
      emit({ type: 'teach', teaching })
      emit({ type: 'profile', profile: s.profile })
      offerExercises(s, emit, { bug: d.bug })
    } else if (s.lastTeach && fractionAttempt(focus.plain) && (focus.verdict === 'correct' || focus.verdict === 'wrong')) {
      // the next fraction sum after a teaching tells whether that style worked
      const right = focus.verdict === 'correct'
      const p = s.profile[s.lastTeach.style] || { tries: 0, wins: 0 }
      s.profile[s.lastTeach.style] = { tries: p.tries + 1, wins: p.wins + (right ? 1 : 0) }
      if (right && s.misconceptions[s.lastTeach.misconceptionId]) fixMisconception(s.misconceptions[s.lastTeach.misconceptionId])
      s.lastTeach = null
      emit({ type: 'profile', profile: s.profile })
    }
    if (!d && focus.verdict === 'correct') emit({ type: 'teach', teaching: null })
  }
  const target = focus ?? last
  await sendTopic(s, target.raw || target.latex, emit)

  // What Glim says about the newest line. The tutor model's words are kept unless they can be
  // wrong where the code knows better:
  // - a sum of fractions is checked and taught exactly: the computed words are said (the model's
  //   praised "adding the tops and the bottoms" on a right answer, and taught 2/5 + 1/3 with halves);
  // - another line the exact check (or the steps of an equation) marked differently from the
  //   model: its words would contradict the mark.
  const ids = new Map(read1.map((x, k) => [work[k].n, x.part.id]))
  const fb = typeof out.json?.feedback === 'string' ? renumber(plainReply(out.json.feedback), ids) : ''
  const fbEn = typeof out.json?.feedback_en === 'string' ? renumber(plainReply(out.json.feedback_en), ids) : ''
  let said = fb ? { text: fb, lang, ...(lang !== 'en' && fbEn ? { translation: fbEn } : {}) } : null
  const exact = exactVerdict(last.plain)
  const modelVerdict = read1[read1.length - 1].j?.verdict
  const fractions = Boolean(parseSum(last.plain || '')) || fractionAttempt(last.plain)
  if (exact && (fractions || modelVerdict !== exact || !said)) said = exact === 'correct' ? rightHint(s, last.plain) : (focus === last && teachHint) || say(s, 'wrong_generic')
  else if (!exact && slips.has(last.id) && modelVerdict !== 'wrong') said = say(s, slips.get(last.id).carried ? 'step_carried' : 'step_slip')
  if (said) emit({ type: 'hint', hint: said })

  // the history keeps every line read (and its photo); the newest one also keeps what Glim said.
  // A line keeps the time it was written (read again later, it stays in its place in the history).
  const lineRecord = (p, h) => remember(s, { kind: 'line', ref: `line:${p.id}`, at: p.at, data: { partId: p.id, latex: p.latex, verdict: p.verdict, note: p.note ?? null, hint: h, photo: thumb } })
  for (const part of changed) if (part !== last) lineRecord(part, null)
  if (changed.includes(last) || said) lineRecord(last, said?.text ?? null)

  // the line is unfinished or wrong: work the whole exercise out, step by step (a slip in an
  // equation: the exercise it came from, not the slip)
  if (target.note === 'not finished yet' || target.verdict === 'wrong') await sendSteps(s, slips.get(target.id)?.exercise ?? (target.raw || target.latex), emit, { image: read.image })
}

// ---------- the whole solution, step by step ----------

const STEPS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    steps: { type: 'array', items: { type: 'object', properties: { say: { type: 'string' }, math: { type: 'string' } }, required: ['say', 'math'] } },
    result: { type: 'string' },
    antiderivative: { type: 'string' },
    derivative: { type: 'string' },
    exercise: { type: 'string' },
  },
  required: ['steps', 'result', 'exercise'],
}
const mathKey = (t) => String(t || '').replace(/\$|\\[()[\]]|\s|=+$/g, '').toLowerCase()
const unwrap = (t) => String(t || '').replace(/^\$+|\$+$/g, '').trim()

// The exercise for the steps' title, without the student's wrong answer: "6 × 7 = 48" -> "6 × 7".
function exerciseAbout(exercise) {
  const tex = aboutTex(exercise)
  const plain = toPlain(exercise)
  const i = tex.indexOf('=')
  return plain && checkEquation(plain) === false && i > 0 ? tex.slice(0, i).trim() : tex
}

// One value of a result, read as a number: c(\ln 2), or c(0.693) with the precision it is shown at.
function constValue(src) {
  const t = String(src || '').trim()
  if (!t || /\d\s+\d/.test(t)) return null // "4 r 2" once the words are gone: not one number
  for (const x of [t, texToPlain(t)]) {
    try {
      const v = compile(x, [])()
      if (Number.isFinite(v)) return v
    } catch {
      // not a constant expression
    }
  }
  return null
}
// A result as numbers: one entry per answer ("x = 2,\ x = -3" has two), each the values it is
// written as ("\ln 2 \approx 0.693": ln 2 exactly, 0.693 to 3 decimals). null when it can't be
// read as numbers (an inequality, words, a set...).
function resultValues(tex) {
  let t = unwrap(tex).replace(/(\d)\{,\}(\d)/g, '$1.$2')
  if (!t || /\d,\d|[<>≤≥≠]|\\(?:[lg]eq?|[lg]t|neq?|in|infty|emptyset|varnothing)(?![a-zA-Z])/.test(t)) return null
  t = t
    .replace(/\\text\s*\{\s*(?:or|and|oder|und|ou|et|o|e)\s*\}/gi, ',')
    .replace(/\\(?:quad|qquad|lor|vee)(?![a-zA-Z])|\\\\|;|\s(?:or|and)\s/g, ',')
    .replace(/\\(?:text|mathrm)\s*\{[^{}]*\}/g, ' ')
    .replace(/\\[,;:! ]/g, ' ')
  const answers = []
  for (const piece of t.split(',')) {
    if (!piece.trim()) continue
    const pm = (piece.match(/\\(?:pm|mp)(?![a-zA-Z])|±/g) || []).length
    if (pm > 1) return null
    const variants = pm ? ['+', '-'].map((sign) => piece.replace(/\\(?:pm|mp)(?![a-zA-Z])|±/, sign)) : [piece]
    for (const v of variants) {
      const parts = v.split(/(=|\\approx(?![a-zA-Z])|≈|\\simeq(?![a-zA-Z])|\\doteq(?![a-zA-Z]))/)
      const values = []
      for (let k = 0; k < parts.length; k += 2) {
        const x = constValue(parts[k])
        if (x === null) continue
        const decimals = Math.max(-1, ...(parts[k].match(/\d*\.\d+/g) || []).map((d) => d.split('.')[1].length))
        const approx = decimals >= 0 || (k > 0 && parts[k - 1] !== '=')
        values.push({ v: x, approx, tol: approx ? (decimals >= 0 ? 10 ** -decimals : 1) : 1e-9 * Math.max(1, Math.abs(x)) })
      }
      if (!values.length) return null
      answers.push(values)
    }
  }
  return answers.length ? answers : null
}
// 'same', 'approx' (equal to the precision shown), 'partial' (some answers in common, e.g. one root
// of two), 'differ' (no answer in common), or null (not both numbers).
function compareResults(a, b) {
  const A = resultValues(a)
  const B = resultValues(b)
  if (!A || !B) return null
  const near = (x, y) => Math.abs(x.v - y.v) <= x.tol + y.tol + 1e-12
  const exactly = (x, y) => !x.approx && !y.approx && Math.abs(x.v - y.v) <= 1e-9 * Math.max(1, Math.abs(x.v), Math.abs(y.v))
  const meets = (xs, ys, eq) => xs.some((x) => ys.some((y) => eq(x, y)))
  const covers = (X, Y, eq) => X.every((xs) => Y.some((ys) => meets(xs, ys, eq)))
  if (!covers(A, B, near) || !covers(B, A, near)) return A.some((xs) => B.some((ys) => meets(xs, ys, near))) ? 'partial' : 'differ'
  return covers(A, B, exactly) && covers(B, A, exactly) ? 'same' : 'approx'
}
const exactForm = (tex) => resultValues(tex)?.every((xs) => xs.some((x) => !x.approx)) ?? false
// The animation's value is the written arithmetic itself (27 + 15, 1/2 + 1/3), computed exactly.
function sceneIsWritten(sc, exercise) {
  const lhs = toPlain(exercise).split('=')[0]
  const v = lhs ? evaluate(lhs) : null
  if (!v) return false
  return compareResults(sc.resultTex, v.d === 1 ? String(v.n) : `\\frac{${v.n}}{${v.d}}`) === 'same'
}

// Solves the exercise (computes it) and sends {type: 'steps'}: what each step does and why, the
// line written at that step, and the result. Once per exercise (the same line read again
// keeps the steps already on screen).
// ---------- the decision model: which animation explains this exercise ----------
//
// Laya (convaiinnovations/laya, Apache-2.0, a 421M encoder; decide/laya_service.py) picks one
// of the ready-made animations in ~45 ms, taught with labelled examples. scenes.js reads the
// numbers and checks them by computing; if Laya is unsure, disagrees with what can be computed,
// or isn't running (e.g. on Vercel), the rules decide. When the rules had to correct Laya, the
// example is sent back to it, so it keeps learning from use.
const DECIDE_URL = process.env.DECIDE_URL ?? 'http://127.0.0.1:8091'

async function askLaya(path, body, timeoutMs = 1500) {
  if (!DECIDE_URL) return null
  try {
    const r = await fetch(`${DECIDE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

/** The animation for an exercise, as a session would pick it (GET /api/scene, for testing: it never teaches Laya). */
export async function previewScene(exercise, age) {
  return decideScene({ age: Number(age) || null, ai: {} }, exercise)
}

// Only decides; what Laya learns is sent by sendSteps, once the animation has passed its checks.
async function decideScene(s, exercise, extra = {}) {
  const laya = await askLaya('/decide', { text: exercise })
  if (laya) s.ai.decisions = (s.ai.decisions || 0) + 1
  const scene = sceneFor({ exercise, kind: laya?.kind, age: s.age, subject: s.subject, ...extra })
  return scene && { ...scene, laya: laya ? { kind: laya.kind, probability: laya.probability, ms: laya.ms } : null }
}
// Test traffic (QA, npm run e2e and e2e:failures) never changes what Laya has learned.
const TEST_SESSION = /^(qa|e2e|fail)-/
// Teach Laya only what it couldn't answer itself (never overrule a choice it made), from real
// sessions, and only an animation that was kept.
function teachLaya(s, text, scene) {
  if (scene && scene.laya?.kind === 'none' && text && s.id && !TEST_SESSION.test(String(s.id))) askLaya('/learn', { text, kind: scene.kind })
}
const compatibleKinds = (a, b) => a === b || (['count', 'number_line'].includes(a) && ['count', 'number_line'].includes(b))

const ageNote = (s) => (s.age ? ` The student is ${s.age} years old: explain at that level.` : '')

// Solves the exercise and sends {type: 'steps'}: first the animation (as soon as the decision
// model has picked it), then the tutor's worked solution. Once per exercise.
async function sendSteps(s, exercise, emit, { reason = 'line', image } = {}) {
  const key = mathKey(exercise)
  if (!key || s.stepsFor === key) return
  s.stepsFor = key
  const lang = LANG_NAME[s.lang] ? s.lang : 'en'
  s.topics = [...new Set([...(s.topics || []), unwrap(stripMath(exercise))])].slice(-30)
  const about = exerciseAbout(exercise)
  const steps = { about, title: 'Step by step', items: [], result: '', lang, reason, at: Date.now() }
  emit({ type: 'status', state: 'thinking' })
  // The photo lets the tutor fix OCR slips, but it also "fixes" correct numbers from the photo
  // (seen live: the bound 1 of an integral read as 4, so the steps solved another exercise). When
  // the text as read can already be computed, only the text is sent.
  let computable = null
  try {
    computable = image ? sceneFor({ exercise, age: s.age }) : null
  } catch {
    computable = null
  }
  const photo = image && !computable ? image : undefined
  const scene = decideScene(s, exercise).then((sc) => {
    if (sc) {
      Object.assign(steps, { scene: sc, result: sc.resultTex, ...(sc.exerciseTex ? { about: sc.exerciseTex.replace(/=\s*$/, '').trim() } : {}) })
      emit({ type: 'steps', steps: { ...steps } }) // the animation can start now
    }
    return sc
  })
  const worked = complete('tutor', {
    messages: [
      {
        role: 'system',
        content: `${SOLVE_INTRO[s.subject] ?? SOLVE_INTRO.maths}${ageNote(s)}
For each step:
- "say": what we do and why, in ${LANG_NAME[lang]}, one or two short, simple sentences, plain text (maths written like 1/(1+x) or x², not LaTeX);
- "math": the line written at this step, in LaTeX (without $).
"result": the final answer in LaTeX (without $), exact, with a decimal value when it helps (e.g. \\ln 2 \\approx 0.693).
"title": a short title, e.g. "Step by step".
"antiderivative": only for an integral, an antiderivative of the function in plain text (e.g. "ln(1+x)").
"derivative": only for a derivative, the derivative function in plain text (e.g. "3x^2").
"exercise": the exercise as written on the paper, in clean LaTeX (without $). The text comes from an OCR model that can misread symbols (S or f for the integral sign, + for 1, l for 1): ${photo ? 'check it against the photo and ' : ''}fix only such reading slips, not the student's maths.
Compute carefully and check the result before answering.`,
      },
      { role: 'user', content: `Exercise (as read from the paper by OCR, maybe unfinished): ${exercise}`, ...(photo ? { images: [photo] } : {}) },
    ],
    schema: STEPS_SCHEMA,
    maxTokens: 1400,
    temperature: 0.1,
  }).catch(() => null)
  let [sc, out] = await Promise.all([scene.catch(() => null), worked])
  let sceneText = exercise // what the animation was built from (what Laya may learn)
  // the OCR text didn't give an animation: try the exercise as the tutor read it (photo + text)
  const clean = typeof out?.json?.exercise === 'string' ? unwrap(out.json.exercise) : ''
  if (!sc && clean && mathKey(clean) !== key) {
    sc = await decideScene(s, clean, { antiderivative: out?.json?.antiderivative }).catch(() => null)
    if (sc) {
      steps.about = clean
      sceneText = clean
    }
  }
  // a word to spell: its animation needs the right spelling, which the tutor has just given
  if (!sc && s.subject === 'reading' && typeof out?.json?.result === 'string') {
    sc = await decideScene(s, exercise, { answer: unwrap(out.json.result) }).catch(() => null)
  }
  // the integral animation can show F(b) - F(a) once the tutor gives an antiderivative (checked there)
  if (sc?.kind === 'derivative' && !sc.formula && out?.json?.derivative) {
    const better = sceneFor({ exercise, kind: 'derivative', age: s.age, derivative: out.json.derivative })
    if (better?.formula) sc = { ...better, decidedBy: sc.decidedBy, laya: sc.laya }
  }
  if (sc?.kind === 'area' && !sc.antiderivative && out?.json?.antiderivative) {
    const better = sceneFor({ exercise, kind: 'area', age: s.age, antiderivative: out.json.antiderivative })
    if (better?.antiderivative) sc = { ...better, decidedBy: sc.decidedBy, laya: sc.laya }
  }
  if (out) s.ai.bigCalls += 1
  let items = (Array.isArray(out?.json?.steps) ? out.json.steps : [])
    .filter((x) => x?.say || x?.math)
    .slice(0, 8)
    .map((x) => ({ say: plainReply(x.say), math: unwrap(x.math) }))
  // The animation's result is computed, so it usually wins over the model's. When both are numbers:
  // - they disagree and the animation's value is the written arithmetic, computed exactly: the
  //   tutor's working is wrong, so only the animation is shown;
  // - they have no answer in common otherwise: the rules most likely read another exercise, so the
  //   animation is dropped and the tutor's solution kept;
  // - they agree only approximately (\ln 2 vs 0.693): the exact form is shown.
  const tutorResult = typeof out?.json?.result === 'string' ? unwrap(out.json.result) : ''
  let result = sc?.resultTex || tutorResult
  let dropped = false
  if (sc && tutorResult && sc.kind !== 'graph' && !DOMAIN_KINDS.includes(sc.kind)) {
    const agree = compareResults(sc.resultTex, tutorResult)
    if (agree === 'differ' && sceneIsWritten(sc, sceneText)) items = []
    else if (agree === 'differ') {
      sc = null
      dropped = true
      delete steps.scene
      steps.about = clean ? exerciseAbout(clean) : about
      result = tutorResult
    } else if (agree === 'approx' && !(exactForm(sc.resultTex) && !exactForm(tutorResult))) result = tutorResult
  }
  if (sc) {
    steps.scene = sc
    s.kindsSeen = [...new Set([...(s.kindsSeen || []), sc.kind])]
    if (s.topic?.kind !== sc.kind) {
      s.topic = { kind: sc.kind, label: TOPIC[sc.kind] }
      emit({ type: 'topic', topic: s.topic })
    }
    teachLaya(s, sceneText, sc)
    // for Practise again: the exercise as its animation reads it (a spelling as "becaus -> because")
    const again = sc.kind === 'spelling' ? (sc.attempt ? `${sc.attempt} -> ${sc.word}` : `spell ${sc.word}`) : sceneText
    s.solved = [...(s.solved || []).filter((x) => x !== again), again].slice(-20)
  }
  if (!items.length && !sc && !dropped) {
    s.stepsFor = null
    return
  }
  const title = typeof out?.json?.title === 'string' && out.json.title.trim()
  Object.assign(steps, { title: title || 'Step by step', items, result })
  emit({ type: 'steps', steps: { ...steps } })
  remember(s, { kind: 'steps', ref: `steps:${key}`, data: { about: steps.about, title: steps.title, result: steps.result, scene: sc ?? null, items } })
}

// ---------- the end of a session: what happened, in a few friendly lines ----------

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    praise: { type: 'string' },
    practised: { type: 'array', items: { type: 'string' } },
    mistakes: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, tip: { type: 'string' } }, required: ['what', 'tip'] } },
    next: { type: 'string' },
    for_adults: { type: 'string' },
    // exercises to practise next time (checked by code before they are suggested: review.js)
    review: { type: 'array', items: { type: 'object', properties: { exercise: { type: 'string' }, why: { type: 'string' } }, required: ['exercise', 'why'] } },
  },
  required: ['title', 'praise', 'practised', 'mistakes', 'next', 'for_adults'],
}

const TOPIC = {
  count: 'Adding and taking away', number_line: 'Adding and subtracting', columns: 'Column addition and subtraction', groups: 'Multiplication',
  area_model: 'Long multiplication', sharing: 'Division', fractions: 'Fractions', percent: 'Percentages', order_ops: 'Order of operations',
  powers: 'Powers and logarithms', mean: 'Averages', balance: 'Equations', inequality: 'Inequalities', pythagoras: 'Pythagoras',
  pairs: 'Number patterns', quadratic: 'Quadratic equations', system: 'Simultaneous equations', graph: 'Functions and graphs',
  trig: 'Trigonometry', limit: 'Limits', derivative: 'Derivatives', area: 'Integrals', chance: 'Probability', combinations: 'Combinations', tree: 'Probability trees',
  syllables: 'Syllables', phonics: 'Phonics', spelling: 'Spelling', plural: 'Plurals', sentence: 'Sentences and punctuation',
  units: 'Units and conversions', speed: 'Speed, distance and time', density: 'Floating and sinking', circuit: 'Electric circuits', states: 'States of matter', food_chain: 'Food chains',
}

// What kind of maths this is (Laya + the parsers), shown as the topic everywhere in the app.
async function sendTopic(s, exercise, emit) {
  const laya = await askLaya('/decide', { text: exercise }, 1000)
  const sc = sceneFor({ exercise, kind: laya?.kind, age: s.age })
  // Laya's guess alone (no animation could be built to check it) only within the session's subject:
  // a worded maths problem was seen sent to "Electric circuits" or "States of matter"
  const guess = laya && laya.kind !== 'none' && laya.probability >= 0.5 && TOPIC[laya.kind] && (SUBJECT_OF[laya.kind] ?? 'maths') === (s.subject || 'maths') ? laya.kind : null
  const kind = sc?.kind ?? guess
  if (!kind) return
  s.kindsSeen = [...new Set([...(s.kindsSeen || []), kind])]
  if (s.topic?.kind !== kind) {
    s.topic = { kind, label: TOPIC[kind] }
    emit({ type: 'topic', topic: s.topic })
  }
}

const KIND_WORDS = Object.fromEntries(Object.entries(TOPIC).map(([k, v]) => [k, v.toLowerCase()]))

// The counted summary (used when the model can't write one), in the session's language.
const plural = (n, one, many) => (n === 1 ? one : many)
const SUMMARY_TEXT = {
  en: {
    emptyTitle: 'Thanks for coming by!', emptyPraise: 'Next time, write a line or point at an exercise and ask me.', emptyNext: 'Try one exercise on your paper.', emptyAdults: 'Nothing was written in this session.',
    allRight: 'Everything right today!', good: 'Good work today!', maths: 'Maths', tip: 'Watch the animation again, then try a similar one.',
    nextWrong: 'Try a similar exercise, and check each step.', nextRight: 'Try a harder exercise next time.',
    praise: (n, r, q) => `You wrote ${n} ${plural(n, 'line', 'lines')}${n ? ` and got ${r} right` : ''}${q ? `, and asked ${q} ${plural(q, 'question', 'questions')}` : ''}.`,
    adults: (who, n, r, w, q, min) => `${who || 'The student'} wrote ${n} ${plural(n, 'line', 'lines')} (${r} right, ${w} not yet) and asked ${q} ${plural(q, 'question', 'questions')} in ${min} min.`,
    working: 'Working on', fixed: 'Fixed today',
  },
  fr: {
    emptyTitle: 'Merci pour ta visite !', emptyPraise: 'La prochaine fois, écris une ligne ou montre un exercice du doigt et pose-moi ta question.', emptyNext: 'Essaie un exercice sur ta feuille.', emptyAdults: 'Rien n’a été écrit pendant cette séance.',
    allRight: 'Tout juste aujourd’hui !', good: 'Bon travail aujourd’hui !', maths: 'Maths', tip: 'Regarde encore l’animation, puis essaie un exercice semblable.',
    nextWrong: 'Essaie un exercice semblable et vérifie chaque étape.', nextRight: 'La prochaine fois, essaie un exercice plus difficile.',
    praise: (n, r, q) => (n ? `Tu as écrit ${n} ${n > 1 ? 'lignes' : 'ligne'} (${r} ${r > 1 ? 'justes' : 'juste'})${q ? ` et posé ${q} ${q > 1 ? 'questions' : 'question'}` : ''}.` : `Tu as posé ${q} ${q > 1 ? 'questions' : 'question'}.`),
    adults: (who, n, r, w, q, min) => `${who || 'L’élève'} a écrit ${n} ${n > 1 ? 'lignes' : 'ligne'} (${r} ${r > 1 ? 'justes' : 'juste'}, ${w} pas encore) et posé ${q} ${q > 1 ? 'questions' : 'question'} en ${min} min.`,
    working: 'Erreurs encore à corriger', fixed: 'Erreurs corrigées aujourd’hui',
  },
  de: {
    emptyTitle: 'Danke fürs Vorbeischauen!', emptyPraise: 'Schreib nächstes Mal eine Zeile oder zeig auf eine Aufgabe und frag mich.', emptyNext: 'Versuch eine Aufgabe auf deinem Blatt.', emptyAdults: 'In dieser Sitzung wurde nichts geschrieben.',
    allRight: 'Heute alles richtig!', good: 'Gute Arbeit heute!', maths: 'Mathe', tip: 'Schau dir die Animation noch einmal an und versuch dann eine ähnliche Aufgabe.',
    nextWrong: 'Versuch eine ähnliche Aufgabe und prüf jeden Schritt.', nextRight: 'Versuch nächstes Mal eine schwierigere Aufgabe.',
    praise: (n, r, q) => (n ? `Du hast ${n} ${plural(n, 'Zeile', 'Zeilen')} geschrieben (${r} richtig)${q ? ` und ${q} ${plural(q, 'Frage', 'Fragen')} gestellt` : ''}.` : `Du hast ${q} ${plural(q, 'Frage', 'Fragen')} gestellt.`),
    adults: (who, n, r, w, q, min) => `${who || 'Das Kind'} hat in ${min} Min. ${n} ${plural(n, 'Zeile', 'Zeilen')} geschrieben (${r} richtig, ${w} noch nicht) und ${q} ${plural(q, 'Frage', 'Fragen')} gestellt.`,
    working: 'Fehler, an denen noch gearbeitet wird', fixed: 'Heute korrigierte Fehler',
  },
  it: {
    emptyTitle: 'Grazie della visita!', emptyPraise: 'La prossima volta scrivi una riga o indica un esercizio e chiedimi.', emptyNext: 'Prova un esercizio sul tuo foglio.', emptyAdults: 'In questa sessione non è stato scritto nulla.',
    allRight: 'Tutto giusto oggi!', good: 'Bel lavoro oggi!', maths: 'Matematica', tip: 'Riguarda l’animazione, poi prova un esercizio simile.',
    nextWrong: 'Prova un esercizio simile e controlla ogni passaggio.', nextRight: 'La prossima volta prova un esercizio più difficile.',
    praise: (n, r, q) => (n ? `Hai scritto ${n} ${plural(n, 'riga', 'righe')} (${r} ${plural(r, 'giusta', 'giuste')})${q ? ` e fatto ${q} ${plural(q, 'domanda', 'domande')}` : ''}.` : `Hai fatto ${q} ${plural(q, 'domanda', 'domande')}.`),
    adults: (who, n, r, w, q, min) => `${who ? `${who} ha` : 'Ha'} scritto ${n} ${plural(n, 'riga', 'righe')} (${r} ${plural(r, 'giusta', 'giuste')}, ${w} non ancora) e fatto ${q} ${plural(q, 'domanda', 'domande')} in ${min} min.`,
    working: 'Errori ancora da correggere', fixed: 'Errori corretti oggi',
  },
}
// Mistakes: what the student hears ("You ...") and the name for grown-ups. English uses BUGS.
const MISTAKE_TEXT = {
  fr: {
    adds_across: ['Tu as additionné les numérateurs entre eux et les dénominateurs entre eux.', 'additionner numérateurs et dénominateurs'],
    no_scaling: ['Tu as changé le dénominateur, mais pas le numérateur.', 'changer le dénominateur sans le numérateur'],
    keeps_bigger_bottom: ['Tu as gardé un des dénominateurs.', 'garder un des dénominateurs'],
    multiplies: ['Tu as multiplié au lieu d’additionner.', 'multiplier au lieu d’additionner'],
    right_top_adds_bottoms: ['Tu as additionné les dénominateurs.', 'additionner les dénominateurs'],
    unknown: ['Le total n’était pas encore juste.', 'trouver le bon total'],
  },
  de: {
    adds_across: ['Du hast die Zähler und die Nenner addiert.', 'Zähler und Nenner getrennt addieren'],
    no_scaling: ['Du hast den Nenner geändert, aber nicht den Zähler.', 'den Nenner ändern, aber nicht den Zähler'],
    keeps_bigger_bottom: ['Du hast einen der Nenner behalten.', 'einen der Nenner behalten'],
    multiplies: ['Du hast multipliziert statt addiert.', 'multiplizieren statt addieren'],
    right_top_adds_bottoms: ['Du hast die Nenner addiert.', 'die Nenner addieren'],
    unknown: ['Das Ergebnis stimmte noch nicht.', 'das richtige Ergebnis finden'],
  },
  it: {
    adds_across: ['Hai sommato i numeratori e i denominatori.', 'sommare numeratori e denominatori'],
    no_scaling: ['Hai cambiato il denominatore, ma non il numeratore.', 'cambiare il denominatore ma non il numeratore'],
    keeps_bigger_bottom: ['Hai tenuto uno dei denominatori.', 'tenere uno dei denominatori'],
    multiplies: ['Hai moltiplicato invece di sommare.', 'moltiplicare invece di sommare'],
    right_top_adds_bottoms: ['Hai sommato i denominatori.', 'sommare i denominatori'],
    unknown: ['Il risultato non era ancora giusto.', 'trovare il risultato giusto'],
  },
}
for (const t of Object.values(MISTAKE_TEXT)) t.lcd_no_scaling = t.no_scaling // the same mistake, said the same way
function mistakeWords(m, lang) {
  if (lang !== 'en') {
    const [what, name] = MISTAKE_TEXT[lang][m.id] || MISTAKE_TEXT[lang].unknown
    return { what, name }
  }
  const label = BUGS.find((b) => b.id === m.id)?.label
  return { what: label ? `You ${label}.` : 'You didn’t get the right total.', name: m.name }
}
const TOPIC_L = {
  fr: {
    count: 'Additionner et soustraire', number_line: 'Additions et soustractions', columns: 'Opérations posées', groups: 'Multiplication', area_model: 'Multiplication posée', sharing: 'Division',
    fractions: 'Fractions', percent: 'Pourcentages', order_ops: 'Priorités des opérations', powers: 'Puissances et logarithmes', mean: 'Moyennes', balance: 'Équations', inequality: 'Inéquations',
    pythagoras: 'Théorème de Pythagore', pairs: 'Suites de nombres', quadratic: 'Équations du second degré', system: 'Systèmes d’équations', graph: 'Fonctions et graphiques', trig: 'Trigonométrie',
    limit: 'Limites', derivative: 'Dérivées', area: 'Intégrales', chance: 'Probabilités', combinations: 'Combinaisons', tree: 'Arbres de probabilités',
  },
  de: {
    count: 'Plus und Minus', number_line: 'Addieren und Subtrahieren', columns: 'Schriftliches Rechnen', groups: 'Multiplikation', area_model: 'Schriftliche Multiplikation', sharing: 'Division',
    fractions: 'Brüche', percent: 'Prozente', order_ops: 'Rechenregeln', powers: 'Potenzen und Logarithmen', mean: 'Mittelwerte', balance: 'Gleichungen', inequality: 'Ungleichungen',
    pythagoras: 'Satz des Pythagoras', pairs: 'Zahlenmuster', quadratic: 'Quadratische Gleichungen', system: 'Gleichungssysteme', graph: 'Funktionen und Graphen', trig: 'Trigonometrie',
    limit: 'Grenzwerte', derivative: 'Ableitungen', area: 'Integrale', chance: 'Wahrscheinlichkeit', combinations: 'Kombinatorik', tree: 'Baumdiagramme',
  },
  it: {
    count: 'Addizioni e sottrazioni', number_line: 'Addizioni e sottrazioni', columns: 'Operazioni in colonna', groups: 'Moltiplicazione', area_model: 'Moltiplicazione in colonna', sharing: 'Divisione',
    fractions: 'Frazioni', percent: 'Percentuali', order_ops: 'Ordine delle operazioni', powers: 'Potenze e logaritmi', mean: 'Medie', balance: 'Equazioni', inequality: 'Disequazioni',
    pythagoras: 'Teorema di Pitagora', pairs: 'Successioni numeriche', quadratic: 'Equazioni di secondo grado', system: 'Sistemi di equazioni', graph: 'Funzioni e grafici', trig: 'Trigonometria',
    limit: 'Limiti', derivative: 'Derivate', area: 'Integrali', chance: 'Probabilità', combinations: 'Combinazioni', tree: 'Diagrammi ad albero',
  },
}
const topicLabel = (kind, lang) => TOPIC_L[lang]?.[kind] || TOPIC[kind]

// Never guess the student's gender (English text): he/she/him/his/her/hers/himself/herself become
// their name, or "the student" ("her answer" -> "Sam's answer", "ask her to" -> "ask Sam to").
const HER_OBJECT =
  /^(?:\s*(?:[.,;:!?)"”’]|$)|\s+(?:to|a|an|the|some|more|any|time|with|how|if|when|what|why|that|this|these|those|again|and|or|but|so|as|at|in|on|for|from|by|about|into|through|one|two|another|each|every|plenty|practise|practice|try|see|think|check|write|find|use|do|keep|look|add|explain|say|notice|remember|compare|count|draw|read|solve|learn|review|revisit|focus|build|spot|slow|celebrate|feel|know|understand|get|make|go|take|show|tell|ask|give|help|start|stop|continue|work\s+(?:on|through|out))\b)/i
function neutralize(t, name) {
  const who = name || 'the student'
  const cap = (w, str, at) => (/(?:^|[.!?]["”’)]?\s+)$/.test(str.slice(0, at)) ? w[0].toUpperCase() + w.slice(1) : w)
  return String(t || '')
    .replace(/\b(?:he|she)\b/gi, (m, at, str) => cap(who, str, at))
    .replace(/\b(?:himself|herself)\b/gi, 'themselves')
    .replace(/\b(?:his|hers)\b/gi, (m, at, str) => cap(`${who}'s`, str, at))
    .replace(/\bher\b/gi, (m, at, str) => cap(HER_OBJECT.test(str.slice(at + m.length)) ? who : `${who}'s`, str, at))
    .replace(/\bhim\b/gi, (m, at, str) => cap(who, str, at))
}
// A recognised kind of maths is already in the model's topics (English): whole words only
// ("sin" is not in "Using", "mean" as a verb is not an average).
const MENTION = {
  count: /\badd|\bsubtract|taking away|\bcount/i, number_line: /\badd|\bsubtract/i, columns: /\badd|\bsubtract|column/i, groups: /multipl|\btimes\b/i, area_model: /multipl/i,
  sharing: /divi|\bshar/i, fractions: /fraction/i, percent: /percent/i, order_ops: /operation|bracket|bidmas|bodmas|pemdas/i, powers: /\bpower|expon|\blog(?:arithm)?s?\b/i,
  mean: /average|\b(?:the|a|arithmetic) mean\b|\bmeans? of\b|\bmean,? median/i, balance: /equation/i, inequality: /inequal/i, pythagoras: /pythag|triangle/i, pairs: /1 \+ 2|\bsums?\b|pattern/i,
  quadratic: /quadratic|parabola/i, system: /simultaneous|system|two equations/i, graph: /graph|function/i, trig: /\btrig|\bsin(?:e|es)?\b|\bcos(?:ine)?\b|\btan(?:gent)?\b/i, limit: /\blimit/i,
  derivative: /derivative|slope|tangent/i, area: /integral|area under|calculus/i, chance: /probab|chance/i, combinations: /combination|choos|factorial/i, tree: /tree|probab/i,
  syllables: /syllable|\bbeats?\b|clap/i, phonics: /phonic|sounds?\b|digraph/i, spelling: /spell/i, plural: /plural/i, sentence: /sentence|punctuat|capital/i,
  units: /\bunits?\b|conver|metre|\b(?:kilo|milli)?grams?\b|litre/i, speed: /speed|distance/i, density: /densit|float|sink/i, circuit: /circuit|voltage|current|resist|ohm/i, states: /solid|liquid|\bgas\b|melt|boil|states? of matter/i, food_chain: /food chain|predator|producer|consumer/i,
}
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '')
// "Next time, we will..." under the summary's own "Next time" label: said once
const NEXT_TIME = /^\s*(?:next time|la prochaine fois|nächstes mal|la prossima volta)\s*[,:]?\s*/i
const dropNextTime = (t) => {
  const x = String(t || '').replace(NEXT_TIME, '')
  return x ? x[0].toUpperCase() + x.slice(1) : x
}
// "Keep the bottom number the same and only add the tops" is only right when the bottoms are
// already the same. Said about a session with a sum of fractions with different bottoms, it
// teaches the mistake itself (seen in 3 of 3 summaries for 1/2 + 1/3 = 2/5).
const KEEP_BOTTOM = /\bkeep(?:s|ing)?\s+(?:the\s+)?(?:same\s+)?(?:bottom|denominator)s?(?:\s+numbers?)?(?:\s+the\s+same)?\b|\bonly\s+add\s+the\s+top/i
const MAKES_SAME = /\b(?:make|making|change|changing|turn|turning|common|same size|first)\b/i
const wrongRule = (t) => KEEP_BOTTOM.test(t) && !MAKES_SAME.test(t)
// A mistake with a sum of fractions, in the engine's words, with the student's own line as the
// example and the right way computed: "Make the bottoms the same first: 1/2 + 1/3 = 3/6 + 2/6 = 5/6."
function fractionMistake(m, sum) {
  const d = lcm(sum.a.d, sum.b.d)
  const [p, q] = [sum.a.n * (d / sum.a.d), sum.b.n * (d / sum.b.d)]
  const right = fshow(reduce(F(p + q, d)))
  const line = `${fstr(sum.a)} + ${fstr(sum.b)} = ${fstr(sum.ans)}`
  const what = `${mistakeWords(m, 'en').what.replace(/\.$/, '')}: ${line}.`
  const tip =
    sum.a.d === sum.b.d
      ? `The pieces are already the same size: add the tops and keep the bottom, ${fstr(sum.a)} + ${fstr(sum.b)} = ${fstr(F(sum.a.n + sum.b.n, d))}${right !== fstr(F(sum.a.n + sum.b.n, d)) ? ` = ${right}` : ''}.`
      : `Make the bottoms the same first, then add the tops: ${fstr(sum.a)} + ${fstr(sum.b)} = ${p}/${d} + ${q}/${d} = ${p + q}/${d}${right !== `${p + q}/${d}` ? ` = ${right}` : ''}.`
  return { what, tip }
}

async function summarize(s, emit) {
  const lang = LANG_NAME[s.lang] ? s.lang : 'en'
  const textLang = SUMMARY_TEXT[lang] ? lang : 'en' // the counted text exists in fewer languages
  const L = SUMMARY_TEXT[textLang]
  const lines = s.parts.filter((p) => p.verdict !== 'reading')
  const right = lines.filter((p) => p.verdict === 'correct').length
  const wrong = lines.filter((p) => p.verdict === 'wrong').length
  const minutes = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000))
  // stars are counted, not invented: effort (lines, questions) and how many came out right
  const stars = !lines.length && !s.questions.length ? 1 : Math.min(3, 1 + (lines.length + s.questions.length >= 3 ? 1 : 0) + (lines.length && right / lines.length >= 0.6 ? 1 : 0))
  const facts = { minutes, lines: lines.length, right, wrong, questions: s.questions.length, stars }
  let text = { title: L.emptyTitle, praise: L.emptyPraise, practised: [], mistakes: [], next: L.emptyNext, for_adults: L.emptyAdults }
  let written = textLang // the language the text ends up in
  if (lines.length || s.questions.length) {
    // counted from the session, in case the model can't write it
    const mis = Object.values(s.misconceptions || {})
    const topics = [...new Set((s.kindsSeen || []).map((k) => topicLabel(k, textLang)).filter(Boolean))]
    const words = mis.map((m) => ({ m, ...mistakeWords(m, textLang) }))
    const names = (status) => [...new Set(words.filter((x) => x.m.status === status).map((x) => x.name))].join(', ')
    const working = names('working')
    const fixed = names('fixed')
    text = {
      title: right && right === lines.length ? L.allRight : L.good,
      praise: L.praise(lines.length, right, s.questions.length),
      practised: topics.length ? topics : [L.maths],
      mistakes: [...new Set(words.map((x) => x.what))].map((what) => ({ what, tip: L.tip })).slice(0, 3), // one per mistake, even if two misconceptions read the same
      next: wrong ? L.nextWrong : L.nextRight,
      for_adults: `${L.adults(s.name, lines.length, right, wrong, s.questions.length, minutes)}${working ? ` ${L.working}: ${working}.` : ''}${fixed ? ` ${L.fixed}: ${fixed}.` : ''}`,
    }
  }
  let ideas = [] // the tutor's exercises to practise, checked below
  if (lines.length || s.questions.length) {
    try {
      const out = await complete('tutor', {
        messages: [
          {
            role: 'system',
            content: `You are Glim, a kind ${SUBJECT_NAME[s.subject] ?? 'maths'} tutor, writing the end-of-session summary for ${s.name || 'the student'}${s.age ? `, ${s.age} years old` : ''}. In ${LANG_NAME[lang]}, plain text (maths like 1/2 + 1/3, not LaTeX), short and warm, talking to the student as "you":
- "title": a short, happy title for today${lang === 'en' ? ' (e.g. "Fraction explorer!")' : `, in ${LANG_NAME[lang]}`};
- "praise": one or two sentences about what went well, specific to what they did;
- "practised": 1 to 4 short topics practised today, covering every kind of maths listed below (all pages, not only the last);
- "mistakes": the patterns in their mistakes (not every line), each with a friendly "tip"; empty if there were none;
- "next": one sentence, what to practise next time;
- "for_adults": two or three sentences for a parent or teacher: what was practised, what is solid, what needs work. ${s.name ? `Use the student's name instead of pronouns (e.g. "${s.name} practised ... ${s.name} needs ...").` : 'Say "the student" instead of pronouns, and never make up a name.'}
- "review": 2 or 3 new exercises to practise next time, like today's and aimed at the mistakes if there were any. Each is {"exercise": the maths only, plain, with no answer (e.g. "2/5 + 1/10", "4x + 3 = 19"), "why": one short sentence to the student}.
Only use what is in the session below; don't invent results. When you describe a mistake, use the student's own line as the example. Call the student by name or "they", never "he" or "she".`,
          },
          {
            role: 'user',
            content: [
              `Session: ${minutes} min, ${lines.length} lines written (${right} right, ${wrong} not yet), ${s.questions.length} questions asked.`,
              lines.length ? `Lines (as read from the paper; OCR may misread a symbol, e.g. S for an integral sign):\n${lines.map((p) => `- ${texToPlain(stripMath(p.raw || p.latex))} -> ${p.verdict === 'unsure' ? p.note || 'unfinished' : p.verdict}${p.verdict === 'wrong' && p.note ? ` (${p.note})` : ''}`).join('\n')}` : '',
              s.kindsSeen?.length ? `Kinds of maths, as recognised: ${s.kindsSeen.map((k) => KIND_WORDS[k] || k).join(', ')}` : '',
              s.questions.length ? `Questions:\n${s.questions.map((q) => `- "${q.text}"${q.about ? ` about ${q.about}` : ''}`).join('\n')}` : '',
              s.topics?.length ? `Worked solutions shown for: ${s.topics.map(texToPlain).join('; ')}` : '',
              Object.values(s.misconceptions || {}).length ? `Misconceptions seen: ${Object.values(s.misconceptions).map((m) => `${m.name} (${m.status})`).join(', ')}` : '',
              lines.some((p) => parseSum(p.plain || '') && parseSum(p.plain).a.d !== parseSum(p.plain).b.d) ? 'For fractions with different bottoms, the right way is to make the bottoms the same first, then add the tops (never "keep the bottom the same").' : '',
              lang !== 'en' ? `Write every field in ${LANG_NAME[lang]}, not in English.` : '',
            ].filter(Boolean).join('\n\n'),
          },
        ],
        schema: SUMMARY_SCHEMA,
        maxTokens: 1200,
        temperature: 0.4,
      })
      s.ai.bigCalls += 1
      const j = out.json && typeof out.json === 'object' ? out.json : null
      if (str(j?.title)) {
        // only the expected fields, in the expected shapes (a model can return a string for a list)
        const practised = (Array.isArray(j.practised) ? j.practised : [j.practised]).map(str).filter(Boolean)
        const mistakes = (Array.isArray(j.mistakes) ? j.mistakes : [])
          .map((m) => (typeof m === 'string' ? { what: str(m), tip: '' } : m && typeof m === 'object' ? { what: str(m.what), tip: str(m.tip) } : null))
          .filter((m) => m?.what)
        ideas = (Array.isArray(j.review) ? j.review : []).filter((r) => r && typeof r === 'object').map((r) => ({ exercise: str(r.exercise), why: str(r.why) })).filter((r) => r.exercise).slice(0, 4)
        const counted = text
        text = { title: str(j.title), praise: str(j.praise) || text.praise, practised: practised.slice(0, 4), mistakes: mistakes.slice(0, 4), next: dropNextTime(str(j.next)) || text.next, for_adults: str(j.for_adults) || text.for_adults }
        written = lang
        if (lang === 'en') {
          for (const k of ['title', 'praise', 'next', 'for_adults']) text[k] = neutralize(text[k], s.name)
          text.mistakes = text.mistakes.map((m) => ({ what: neutralize(m.what, s.name), tip: neutralize(m.tip, s.name) }))
          // the mistakes with fractions the engine diagnosed are said in its own words (the right
          // way computed), and the model's rule for fractions is checked where it can be wrong
          const sums = lines.filter((p) => p.verdict === 'wrong').map((p) => parseSum(p.plain || '')).filter(Boolean)
          const known = []
          for (const m of Object.values(s.misconceptions || {})) {
            const sum = sums.find((x) => (diagnose(x.a, x.b, x.ans)[0]?.id ?? 'unknown') === m.id)
            if (sum && !known.some((k) => k.what === fractionMistake(m, sum).what)) known.push(fractionMistake(m, sum))
          }
          if (known.length) text.mistakes = [...known, ...text.mistakes.filter((m) => !/fraction|bottom|top|denominator|numerator/i.test(`${m.what} ${m.tip}`))].slice(0, 4)
          if (lines.some((p) => parseSum(p.plain || '') && parseSum(p.plain).a.d !== parseSum(p.plain).b.d)) {
            for (const k of ['praise', 'for_adults']) if (wrongRule(text[k])) text[k] = counted[k]
            if (wrongRule(text.next)) text.next = 'Practise making the bottoms the same before adding fractions.'
            text.mistakes = text.mistakes.map((m) => (wrongRule(m.tip) ? { ...m, tip: 'Make the bottoms the same first, then add the tops.' } : m))
          }
          // every kind of maths recognised today is listed (counted, not left to the model), and
          // never cut to make room for the model's topics
          const missing = [...new Set((s.kindsSeen || []).filter((k) => TOPIC[k] && !text.practised.some((p) => MENTION[k]?.test(p))).map((k) => TOPIC[k]))]
          text.practised = [...text.practised.slice(0, Math.max(0, 5 - missing.length)), ...missing]
        }
      }
    } catch {
      // keep the counted summary
    }
  }
  // exercises to practise next time, shown in My work: today's lines again or with new numbers
  // (the ones that went wrong first), and the tutor's ideas the code can check
  let review = []
  try {
    review = suggestReview({ seed: s.id, lines: lines.map((p) => ({ latex: p.latex || p.raw, verdict: p.verdict, note: p.note })), questions: s.questions, ideas: ideas.map((r) => ({ ...r, why: lang === 'en' ? neutralize(r.why, s.name) : r.why })), solved: s.solved ?? [], subject: s.subject, age: s.age })
  } catch (err) {
    console.warn('[review]', err.message)
  }
  const summary = { ...text, ...facts, review, reviewVersion: REVIEW_VERSION, lang: written, name: s.name, at: Date.now() }
  s.summary = summary
  emit({ type: 'summary', summary })
  remember(s, { kind: 'summary', ref: 'summary', data: summary })
}

// The exercise as LaTeX for the title: maths stays maths, words stay words ("sum of 7 with two dice")
function aboutTex(exercise) {
  if (/\$|\\\(|\\\[/.test(exercise)) return stripMath(exercise)
  const text = unwrap(exercise)
  const words = text.replace(/\\[a-zA-Z]+/g, ' ').match(/[a-zA-Z]{3,}/g) || []
  const mathWords = /^(sin|cos|tan|log|lim|sqrt|frac|int|exp|cases|begin|end|text|times|div|cdot|infty|circ|binom|left|right|mean|dx|dy)$/i
  return words.some((w) => !mathWords.test(w)) ? `\\text{${text.replace(/[{}\\]/g, '')}}` : text
}

// History: records saved to the database after each event (server/app.js -> store.js).
// `ref` makes a record replaceable: a line read again updates its record.
function remember(s, { kind, ref, data, at }) {
  ;(s.history ||= []).push({ kind, ref: `${s.id}:${ref}`, at: Number.isFinite(at) ? at : Date.now(), data })
}

// ---------- pointing: "what about this?" ----------
//
// The student points at the paper (fingertip found in the browser) and asks. GLM-OCR reads the
// whole photo; the tutor LLM gets the photo (a red ring drawn at the fingertip, nothing cut
// off), the transcription and the question.

const POINT_DEFAULT = { fr: 'Tu peux m’aider avec ça ?', en: 'Can you help me with this?', de: 'Kannst du mir hier helfen?', it: 'Mi aiuti con questo?' }
const POINT_SCHEMA = {
  type: 'object',
  properties: { pointed: { type: 'string' }, answer: { type: 'string' }, answer_en: { type: 'string' } },
  required: ['pointed', 'answer'],
}

function markFingertip(buffer, x, y) {
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return buffer.toString('base64')
  const img = decodeJpeg(buffer)
  const r = Math.max(18, Math.round(Math.min(img.width, img.height) * 0.045))
  drawRing(img, x * img.width, y * img.height, r, Math.max(4, Math.round(r / 6)), [255, 30, 30])
  return toJpegBase64(img, 88)
}

async function answerPointing(s, e, emit) {
  const lang = LANG_NAME[s.lang] ? s.lang : 'en'
  const text = e.text?.trim() || POINT_DEFAULT[lang] || POINT_DEFAULT.en
  const hasTip = typeof e.x === 'number' && typeof e.y === 'number'
  emit({ type: 'question', question: { text, lang: s.lang, final: true } })
  emit({ type: 'status', state: 'answering' })
  const buffer = Buffer.from(e.image.slice(e.image.indexOf(',') + 1), 'base64')
  let read
  try {
    read = await readFrame(buffer) // whole frame -> GLM-OCR
  } catch (err) {
    console.warn('[engine] OCR:', err.message)
    emit({ type: 'answer', answer: { ...TROUBLE.read } })
    return
  }
  s.ai.localReads += 1
  emit({ type: 'page', page: { ...read.page, at: Date.now() } })
  let answer
  let about
  try {
    const out = await complete('tutor', {
      messages: [
        {
          role: 'system',
          content: `${tutorIntro(s)}
The student points at their paper with a finger${hasTip ? ' (a red circle on the photo marks the fingertip)' : ''} and asks a question. You get the photo and the OCR transcription of the whole paper. The transcription is what is written: trust it over your own reading of the photo.
Return:
- "pointed": the line or exercise the finger points at, copied from the transcription (LaTeX, without $). If the finger is on part of an exercise, the whole exercise;
- "answer": your reply to the question about it, in ${LANG_NAME[lang]}, at most 3 short sentences. Answer the question directly and concretely, with the actual maths (the rule, the next step, what it means). The full solution is shown separately, step by step. Write maths in the answer as plain text that can be read aloud (e.g. 1/(1+x), x², 3/4), not LaTeX.${lang !== 'en' ? '\n- "answer_en": the same reply in English.' : ''}`,
        },
        {
          role: 'user',
          content: `OCR transcription of the paper:\n${read.lines.length ? numbered(read.lines) : '(nothing read)'}\n${hasTip ? `\nThe fingertip is at ${Math.round(e.x * 100)}% from the left and ${Math.round(e.y * 100)}% from the top of the photo.` : ''}\nThe student asks: "${text}"`,
          images: [markFingertip(buffer, e.x, e.y)],
        },
      ],
      schema: POINT_SCHEMA,
      maxTokens: 700,
      temperature: 0.3,
    })
    s.ai.bigCalls += 1
    about = (typeof out.json?.pointed === 'string' && out.json.pointed.replace(/^\$+|\$+$/g, '').trim()) || undefined
    const reply = plainReply(replyText(out, 'answer', 'text'))
    const en = typeof out.json?.answer_en === 'string' ? plainReply(out.json.answer_en) : ''
    answer = reply ? { text: reply, lang, ...(lang !== 'en' && en ? { translation: en } : {}) } : { ...TROUBLE.think, error: 'no answer in the reply' }
  } catch (err) {
    console.warn('[engine] tutor model:', err.message)
    answer = { ...TROUBLE.think }
  }
  const key = (t) => String(t || '').replace(/\$|\\[()[\]]|\s/g, '').toLowerCase()
  const part = about && s.parts.find((p) => key(p.raw || p.latex) === key(about))
  emit({ type: 'question', question: { text, lang: s.lang, final: true, ...(about ? { about } : {}), ...(part ? { pointedAt: { partId: part.id, token: '' } } : {}) } })
  s.questions.push({ text, lang: s.lang, about, answer: answer.text, at: Date.now() })
  emit({ type: 'answer', answer })
  remember(s, { kind: 'question', ref: `q:${s.questions.length}`, data: { text, about: about ?? null, answer: answer.text, photo: thumbnail(e.image) } })
  if (about && looksWork(s, about)) await sendSteps(s, about, emit, { reason: 'question' })
}

// ---------- questions ----------

function target(s) {
  return [...s.parts].reverse().find((p) => p.verdict === 'wrong') ?? s.parts[s.parts.length - 1]
}
// The line a typed question is about: the one whose maths it quotes ("why is 3/4 + 1/2 not 4/6?"),
// else, for a question about "this" (why is it wrong? how do I do it?), the newest wrong line;
// a question about something else (the capital of France, 7 times 8) is about no line.
const ABOUT_THIS = /\b(?:this|that|it|its|wrong|right|correct|mistake|why|how|help|explain|answer|line|next|step|fraction|fractions|sum|do|did|check)\b/i
function partAsked(s, text) {
  const bits = String(text || '').match(/[\d(][\d\s+\-*/×÷:=().^]*[\d)]/g) || []
  const keys = bits.map(lineNorm).filter((k) => /\d[+\-*/:^]\(?\d/.test(k))
  if (keys.length) {
    const p = [...s.parts].reverse().find((x) => {
      const pk = partKey(x)
      return keys.some((k) => k === pk || k === lhsOf(pk) || (lhsOf(k) && lhsOf(k) === lhsOf(pk)))
    })
    return p ?? null // maths that is not on the page: no line of it
  }
  return ABOUT_THIS.test(String(text || '')) ? target(s) : null
}

function pointedAt(p) {
  if (!p) return undefined
  const fr = [...p.latex.matchAll(/\\frac\{(\d+)\}\{(\d+)\}/g)].pop()
  return { partId: p.id, token: fr ? fr[2] : '' }
}

async function answerQuestion(s, text, partId, emit, { asked = false } = {}) {
  const p = (partId && s.parts.find((x) => x.id === partId)) || (asked ? partAsked(s, text) : target(s))
  const q = { text, lang: s.lang, final: true, pointedAt: pointedAt(p) }
  emit({ type: 'question', question: q })
  emit({ type: 'status', state: 'answering' })
  let answer
  if (!p && !s.parts.length) {
    answer = s.lang === 'fr' ? { text: 'Écris d’abord quelque chose, puis montre-le-moi.', lang: 'fr', translation: 'Write something first, then point at it.' } : { text: 'Write something first, then point at it.', lang: 'en' }
  } else {
    const sum = p && parseSum(p.plain || '')
    const lang = LANG_NAME[s.lang] ? s.lang : 'en'
    const context = p
      ? [
          `The child (age 8-11) wrote: ${p.plain || p.raw || p.latex}`,
          `Verdict: ${p.verdict}${p.note ? ` (${p.note})` : ''}.`,
          sum ? `The right result is ${fstr(F(sum.a.n * sum.b.d + sum.b.n * sum.a.d, sum.a.d * sum.b.d))} (unreduced).` : '',
        ].join('\n')
      : 'The question is not about a line on the paper.'
    try {
      const out = await complete('tutor', {
        messages: [
          {
            role: 'system',
            content: `You are Glim, a kind ${SUBJECT_NAME[s.subject] ?? 'maths'} tutor for children. Answer in ${LANG_NAME[lang]}, in at most 2 short, simple sentences. Explain the idea; do not just give the final answer.${lang !== 'en' ? ' Also give an English translation.' : ''}`,
          },
          { role: 'user', content: `${context}\nThe child asks: "${text}"` },
        ],
        schema: { type: 'object', properties: { text: { type: 'string' }, translation_en: { type: 'string' } }, required: ['text'] },
        maxTokens: 300,
        temperature: 0.4,
      })
      s.ai.bigCalls += 1
      const reply = plainReply(replyText(out, 'text', 'answer'))
      const en = typeof out.json?.translation_en === 'string' ? plainReply(out.json.translation_en) : ''
      answer = reply ? { text: reply, lang, ...(lang !== 'en' && en ? { translation: en } : {}) } : say(s, 'look_again')
    } catch (err) {
      console.warn('[engine] tutor model:', err?.message || err)
      answer = say(s, 'look_again')
    }
    if (sum && p.verdict === 'wrong') {
      answer.visual = { kind: 'bar_model', rows: [{ n: sum.a.n, d: sum.a.d, label: fstr(sum.a), tone: 'pen' }, { n: sum.b.n, d: sum.b.d, label: fstr(sum.b), tone: 'marker' }] }
    }
  }
  const about = p ? p.plain || p.latex : undefined
  s.questions.push({ text, lang: s.lang, about, answer: answer.text, at: Date.now() })
  emit({ type: 'answer', answer })
  remember(s, { kind: 'question', ref: `q:${s.questions.length}`, data: { text, about: about ?? null, answer: answer.text, photo: null } })
  emit({ type: 'status', state: 'watching' })
}

// ---------- the step function ----------

export async function handle(state, e, emit) {
  const s = state
  s.updatedAt = Date.now()
  switch (e.type) {
    case 'session_start': {
      Object.assign(s, newState({ id: s.id, student: e.student, name: e.name, lang: e.lang, subject: e.subject, age: Number(e.age) || null }))
      emit({ type: 'exercises', items: [] })
      emit({ type: 'profile', profile: s.profile })
      emit({ type: 'teach', teaching: null })
      emit({ type: 'hint', hint: null })
      emit({ type: 'status', state: 'watching' })
      return s
    }
    case 'subject':
      s.subject = e.subject
      return s
    case 'cut_part': {
      if (!e.image) {
        emit({ type: 'hint', hint: say(s, 'no_new_line') })
        return s
      }
      emit({ type: 'status', state: 'reading' })
      const buffer = Buffer.from(e.image.slice(e.image.indexOf(',') + 1), 'base64')
      let read
      try {
        read = await readFrame(buffer) // whole frame -> GLM-OCR
      } catch (err) {
        console.warn('[engine] OCR:', err.message)
        emit({ type: 'hint', hint: { ...TROUBLE.read } })
        emit({ type: 'status', state: 'watching' })
        return s
      }
      s.ai.localReads += 1
      emit({ type: 'page', page: { ...read.page, at: Date.now() } })
      emit({ type: 'status', state: 'thinking' })
      await analyzePage(s, read, e.image, emit) // frame + OCR text -> LLM
      emit({ type: 'status', state: 'watching' })
      return s
    }
    case 'part_typed': {
      const text = typeof e.text === 'string' ? e.text.trim().slice(0, MAX_TYPED).trim() : ''
      if (text) addLine(s, { raw: text }, emit)
      return s
    }
    case 'confirm_reply': {
      // only the line waiting for "Did you write this?" can be confirmed (or sent back)
      if (s.awaiting == null || e.partId !== s.awaiting) return s
      const p = s.parts.find((x) => x.id === e.partId)
      s.awaiting = null
      if (!p) return s
      if (e.ok) {
        emit({ type: 'status', state: 'thinking' })
        const { note: _stale, ...fresh } = p
        judge(s, { ...fresh, confidence: 1 }, emit)
      } else {
        putPart(s, { ...p, verdict: 'unsure', note: 'fix it, then lift your pencil again' }, emit)
        s.readKeys = (s.readKeys || []).filter((r) => r.partId !== p.id) // read that line again next time
      }
      emit({ type: 'status', state: 'watching' })
      return s
    }
    case 'set_age':
      s.age = Number(e.age) || s.age
      s.stepsFor = null // the next animation is made for the new age
      return s
    case 'pick_exercise':
      s.currentExerciseId = e.id
      return s
    case 'ask_start': {
      emit({ type: 'status', state: 'listening' })
      emit({ type: 'question', question: { text: '', lang: s.lang, final: false, pointedAt: pointedAt(target(s)) } })
      return s
    }
    case 'ask_end':
      await answerQuestion(s, ASK_DEFAULT[s.lang] || ASK_DEFAULT.en, null, emit)
      return s
    case 'question_typed': {
      // an empty question is no question (it is not answered, saved or counted)
      const text = typeof e.text === 'string' ? e.text.trim() : ''
      if (!text) {
        emit({ type: 'status', state: 'watching' })
        return s
      }
      await answerQuestion(s, text, e.partId, emit, { asked: true })
      return s
    }
    case 'point': {
      // pointing at the paper (and maybe a typed question): photo + OCR of the whole page -> LLM
      if (!e.image) return s
      await answerPointing(s, e, emit)
      emit({ type: 'status', state: 'watching' })
      return s
    }
    case 'session_end':
      // ended already: its summary again, never a new one (that would reset what was done since)
      if (s.ended && s.summary) {
        emit({ type: 'summary', summary: s.summary })
        emit({ type: 'status', state: 'idle' })
        return s
      }
      emit({ type: 'status', state: 'thinking' })
      await summarize(s, emit)
      s.ended = true
      emit({ type: 'status', state: 'idle' })
      return s
    default:
      return s
  }
}

export { BUGS, sumLatex }
