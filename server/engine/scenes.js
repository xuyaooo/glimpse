// The animation library. Each kind of exercise has a ready-made animation (a "scene") that the
// web app knows how to draw; the AI never writes drawing code. A decision model (the tutor LLM,
// open-source Qwen running locally) picks the kind and pulls out the maths; this file checks it
// by computing everything itself, and writes the stages (one per step) for the child's age.
// No scene fits -> null, and the written step-by-step explanation is shown on its own.
//
//   kind         for                                   kid skin            grown-up skin
//   count        small + and - (results up to 20)      apples, stars...    (number_line)
//   number_line  + and - of whole numbers              jumps on a line     jumps on a line
//   groups       a x b, both up to 12                  plates of cookies   dot array
//   fractions    a/b + c/d, a/b - c/d                  pizzas              bars
//   balance      linear equation in x                  bags and blocks     algebra on a balance
//   pairs        1 + 2 + ... + n                       the pairing trick   the pairing trick
//   area         definite integral                     -                   shaded area under the curve
//   graph        a function of x                       -                   its graph, crossings

import { DOMAIN_KINDS, DOMAIN_LEVEL, buildDomain, detectDomain, wordRule, WORD_KINDS } from './domains.js'

export const MATHS_KINDS = [
  'count', 'number_line', 'columns', 'groups', 'area_model', 'sharing', 'fractions', 'percent', 'order_ops', 'powers',
  'mean', 'balance', 'inequality', 'pythagoras', 'pairs', 'quadratic', 'system', 'graph', 'trig', 'limit', 'derivative',
  'area', 'chance', 'combinations', 'tree',
]
// Reading and Science (domains.js): the same contract, built there
export const SCENE_KINDS = [...MATHS_KINDS, ...DOMAIN_KINDS]

// How advanced each kind is (decides the look with the child's age).
const LEVEL = {
  count: 1, number_line: 1, columns: 1, groups: 1, sharing: 1, area_model: 2, fractions: 2, pairs: 2, percent: 2, mean: 2,
  order_ops: 2, chance: 2, powers: 3, balance: 3, inequality: 3, pythagoras: 3, combinations: 3, tree: 3,
  quadratic: 4, system: 4, graph: 4, trig: 4, limit: 5, derivative: 5, area: 5,
  ...DOMAIN_LEVEL,
}

/** 'kid' (pictures, objects), 'junior' (bars, lines, blocks) or 'grown' (graphs, algebra). */
export function skinFor(kind, age) {
  if (LEVEL[kind] >= 4) return 'grown'
  if (!age) return LEVEL[kind] <= 2 ? 'kid' : 'junior'
  if (age >= 13) return 'grown'
  if (age <= 9) return 'kid'
  return LEVEL[kind] <= 1 ? 'kid' : 'junior'
}

// ------------------------------------------------------------------ maths expressions (no eval)

// One argument of a LaTeX command at s[i] (spaces skipped): a {group} (nested braces too), a
// \command or one character (\frac12, \sqrt x). null if there is none or the braces don't close.
function texArg(s, i) {
  while (s[i] === ' ') i++
  if (s[i] === '{') {
    let depth = 0
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') depth++
      else if (s[j] === '}' && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 }
    }
    return null
  }
  const cmd = /^\\[a-zA-Z]+/.exec(s.slice(i, i + 40))
  if (cmd) return { body: cmd[0], end: i + cmd[0].length }
  return i < s.length && /[\w.]/.test(s[i]) ? { body: s[i], end: i + 1 } : null
}

// Every \frac{a}{b} and \sqrt{a} / \sqrt[n]{a}, inside out, written by frac(a, b) and root(a, n).
// One that can't be read is left as it is (so the parser rejects it rather than guess).
function texFracs(s, frac, root) {
  let out = ''
  let i = 0
  for (;;) {
    const k = s.indexOf('\\', i)
    if (k < 0) return out + s.slice(i)
    const cmd = /^\\(?:[dtc]?frac|sqrt)(?![a-zA-Z])/.exec(s.slice(k, k + 7))
    if (!cmd) {
      out += s.slice(i, k + 1)
      i = k + 1
      continue
    }
    let j = k + cmd[0].length
    let res = null
    if (cmd[0] === '\\sqrt') {
      let index = null
      let t = j
      while (s[t] === ' ') t++
      if (s[t] === '[') {
        const e = s.indexOf(']', t)
        if (e > 0) {
          index = s.slice(t + 1, e).trim()
          j = e + 1
        }
      }
      const A = texArg(s, j)
      if (A && (index === null || index)) res = { text: root(texFracs(A.body, frac, root), index === null ? null : texFracs(index, frac, root)), end: A.end }
    } else {
      const A = texArg(s, j)
      const B = A && texArg(s, A.end)
      if (B) res = { text: frac(texFracs(A.body, frac, root), texFracs(B.body, frac, root)), end: B.end }
    }
    if (!res) {
      out += s.slice(i, j)
      i = j
      continue
    }
    out += s.slice(i, k) + res.text
    i = res.end
  }
}

// |x| is the absolute value. A bar right after a value, and not followed by another value,
// closes the last one opened: |3|x| - 6| is abs(3abs(x) - 6). Bars that don't pair up stay
// (and the parser rejects them), except a single pair: |x|(x + 1) is abs(x)(x + 1).
function absBars(s) {
  const bars = []
  for (let i = 0; i < s.length; i++) if (s[i] === '|') bars.push(i)
  if (!bars.length) return s
  const open = []
  const pairs = []
  let prevValue = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === ' ') continue
    if (ch !== '|') {
      prevValue = /[\w.)\]}]/.test(ch)
      continue
    }
    let j = i + 1
    while (s[j] === ' ') j++
    const nextValue = j < s.length && /[\w.(\\{]/.test(s[j])
    if (open.length && prevValue && !nextValue) {
      pairs.push([open.pop(), i])
      prevValue = true
    } else {
      open.push(i)
      prevValue = false
    }
  }
  if (open.length) {
    if (bars.length !== 2) return s
    pairs.splice(0, pairs.length, bars)
  }
  const opens = new Set(pairs.map((p) => p[0]))
  return [...s].map((ch, i) => (ch !== '|' ? ch : opens.has(i) ? 'abs(' : ')')).join('')
}

// LaTeX commands that only change the look: dropped. Any other command (\lfloor, \infty...) is
// kept, so the parser rejects it instead of computing something else.
const TEX_LOOK = /\\(?:displaystyle|textstyle|scriptstyle|limits|nolimits|mathrm|mathit|mathbf|mathsf|boldsymbol|text|[bB]igg?[lrm]?|q?quad)(?![a-zA-Z])/g
const FN_NAMES = 'arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log|exp'

/** LaTeX or plain text -> plain expression: \frac{1}{1+x} -> ((1)/(1+x)), x^{2} -> x^(2)... */
export function toExpr(src) {
  let s = String(src ?? '').replace(/\$/g, '')
  s = s.replace(/\\(?:left|right)\s*\.|\\left|\\right|\\[,;:!]|\\ /g, ' ')
  // a mixed number is a sum: 1\frac{1}{2} is 1 + 1/2 (not 1 × 1/2)
  s = s.replace(/(?<![\w.^_}])(\d+)\s*\\[dt]?frac\s*\{\s*(\d+)\s*\}\s*\{\s*(\d+)\s*\}/g, '(($1)+($2)/($3))')
  s = texFracs(s, (a, b) => `((${a})/(${b}))`, (a, n) => (n === null ? `sqrt(${a})` : `((${a})^(1/(${n})))`))
  s = s.replace(/\\cdot(?![a-zA-Z])|\\times(?![a-zA-Z])/g, '*').replace(/\\div(?![a-zA-Z])/g, '/')
  s = s.replace(new RegExp(`\\\\(${FN_NAMES})(?![a-zA-Z])`, 'g'), '$1').replace(/\\pi(?![a-zA-Z])/g, 'pi')
  s = absBars(s.replace(/\\(?:lvert|rvert|vert|mid)(?![a-zA-Z])/g, '|'))
  s = s.replace(/\{/g, '(').replace(/\}/g, ')').replace(TEX_LOOK, ' ')
  s = s.replace(/²/g, '^2').replace(/³/g, '^3').replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/:/g, '/')
  // a handwritten times sign is often read as the letter x: between two numbers it means "times"
  // (6x7, 6 x 7); 3x + 5 or 2x = 8 keep their unknown
  s = s.replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1*')
  // ... and also next to a bracket, a fraction or a negative number: (2+3) x 4, 2 x (3 + 4), 3 x -2,
  // \frac{1}{2} x 4 (spaced out; 3x - 2 and 3 x - 2 keep their unknown)
  s = s.replace(/([\d)])\s+[xX]\s+(?=[(\d]|-\d)/g, '$1*').replace(/\)\s*[xX]\s*(?=\d)/g, ')*')
  return s.replace(/\s+/g, ' ').trim()
}

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs,
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => Math.cos(x) / Math.sin(x),
}
// \sin^{-1} x is arcsin x
const INVERSE = { sin: Math.asin, cos: Math.acos, tan: Math.atan }

// b^e, with odd roots of negative numbers: (-8)^(1/3) = -2, (-8)^(2/3) = 4
function pow(b, e) {
  const v = Math.pow(b, e)
  if (!(b < 0) || !Number.isNaN(v) || !Number.isFinite(e)) return v
  for (const q of [3, 5, 7, 9]) {
    const p = Math.round(e * q)
    if (Math.abs(e * q - p) < 1e-9) return (p % 2 ? -1 : 1) * Math.pow(-b, e)
  }
  return v
}

function tokenize(s) {
  const out = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === ' ') {
      i++
      continue
    }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i))
    if (num) {
      out.push({ t: 'num', v: parseFloat(num[1]) })
      i += num[1].length
      continue
    }
    if (/[a-zA-Z]/.test(c)) {
      const rest = s.slice(i, i + 8)
      const fn = /^(arcsin|arccos|arctan|sinh|cosh|tanh|sqrt|sin|cos|tan|sec|csc|cot|exp|abs|ln|log)/.exec(rest)
      if (fn) {
        out.push({ t: 'fn', v: fn[1] })
        i += fn[1].length
      } else if (rest.startsWith('pi')) {
        out.push({ t: 'num', v: Math.PI })
        i += 2
      } else {
        out.push(c === 'e' ? { t: 'num', v: Math.E } : { t: 'var', v: c })
        i++
      }
      continue
    }
    if ('+-*/^()'.includes(c)) {
      out.push({ t: c })
      i++
      continue
    }
    throw new Error(`unexpected "${c}"`)
  }
  // implicit multiplication: 2x, x(1+x), (a)(b), 3sin x
  const withMul = []
  for (const tok of out) {
    const last = withMul[withMul.length - 1]
    const ends = last && (last.t === 'num' || last.t === 'var' || last.t === ')')
    const starts = tok.t === 'num' || tok.t === 'var' || tok.t === 'fn' || tok.t === '('
    if (ends && starts) withMul.push({ t: '*', implicit: true })
    withMul.push(tok)
  }
  return withMul
}

/** Parses an expression in one variable. Returns f(x) (throws on anything it doesn't understand). */
/**
 * Parses an expression. Returns f(...values) for the variables (default one variable, x;
 * e.g. compile('2x + 3y', ['x', 'y'])(1, 2) = 8). Throws on anything it doesn't understand.
 */
export function compile(src, variable = 'x') {
  const vars = Array.isArray(variable) ? variable : [variable]
  const plain = toExpr(src)
  if (plain.length > 2000) throw new Error('too long')
  const toks = tokenize(plain)
  let p = 0
  const peek = () => toks[p]
  const eat = (t) => {
    if (toks[p]?.t !== t) throw new Error(`expected ${t}`)
    p++
  }
  const expr = () => {
    let node = term()
    while (peek()?.t === '+' || peek()?.t === '-') {
      const op = toks[p++].t
      const l = node
      const r = term()
      node = op === '+' ? (...a) => l(...a) + r(...a) : (...a) => l(...a) - r(...a)
    }
    return node
  }
  const term = () => {
    let node = unary()
    while (peek()?.t === '*' || peek()?.t === '/') {
      const op = toks[p++].t
      const l = node
      const r = unary()
      node = op === '*' ? (...a) => l(...a) * r(...a) : (...a) => l(...a) / r(...a)
    }
    return node
  }
  const unary = () => {
    if (peek()?.t === '-') {
      p++
      const u = unary()
      return (...a) => -u(...a)
    }
    if (peek()?.t === '+') {
      p++
      return unary()
    }
    return power()
  }
  const power = () => {
    const base = atom()
    if (peek()?.t === '^') {
      p++
      const ex = unary()
      return (...a) => pow(base(...a), ex(...a))
    }
    return base
  }
  const implicitTimes = () => peek()?.t === '*' && peek().implicit
  const atom = () => {
    const tok = toks[p++]
    if (!tok) throw new Error('unexpected end')
    if (tok.t === 'num') return () => tok.v
    if (tok.t === 'var') {
      const i = vars.indexOf(tok.v)
      if (i < 0) throw new Error(`unknown "${tok.v}"`)
      return (...a) => a[i]
    }
    if (tok.t === 'fn') {
      let f = FUNCS[tok.v]
      // \sin^2 x is (sin x)^2, \sin^{-1} x is arcsin x
      let k = null
      if (peek()?.t === '^') {
        p++
        const e = unary()()
        if (e === -1 && INVERSE[tok.v]) f = INVERSE[tok.v]
        else if (Number.isInteger(e) && e > 0) k = e
        else throw new Error(`unsupported power of ${tok.v}`)
        if (implicitTimes()) p++
      }
      let arg
      if (peek()?.t === '(') arg = atom()
      else {
        // no brackets: the argument is what is written right after it, \sin 2x = sin(2x),
        // up to an operator or another function (\sin x \cos x = sin(x)·cos(x))
        arg = unary()
        while (implicitTimes() && (toks[p + 1]?.t === 'num' || toks[p + 1]?.t === 'var')) {
          p++
          const l = arg
          const r = power()
          arg = (...a) => l(...a) * r(...a)
        }
      }
      return k === null ? (...a) => f(arg(...a)) : (...a) => f(arg(...a)) ** k
    }
    if (tok.t === '(') {
      const e = expr()
      eat(')')
      return e
    }
    throw new Error(`unexpected ${tok.t}`)
  }
  const f = expr()
  if (p !== toks.length) throw new Error('extra input')
  return f
}

// Plain expression -> LaTeX for display: ln(1+x) -> \ln(1+x), x^2 -> x^{2}, sqrt(x) -> \sqrt{x}
export function plainToTex(src) {
  let s = String(src ?? '').trim()
  if (/\\[a-z]+|[{}]/.test(s)) return s // already LaTeX
  s = s.replace(/sqrt\(([^()]*)\)/g, '\\sqrt{$1}')
  s = s.replace(new RegExp(`\\b(${FN_NAMES})\\b`, 'g'), '\\$1')
  // the exponent is one number or one letter, as the parser reads it: e^2x is e²·x, e^(2x) is e^{2x}
  s = s.replace(/\^\(([^()]*)\)/g, '^{$1}').replace(/\^(-?(?:\d+(?:\.\d+)?|pi\b|[a-zA-Z]))/g, '^{$1}')
  s = s.replace(/\*/g, ' \\cdot ').replace(/\bpi\b/g, '\\pi ')
  return s
}

// LaTeX -> words-friendly maths for captions (also read aloud): \frac{1}{1+x} -> 1/(1+x)
export function texToPlain(tex) {
  const simple = (t) => /^[\w.]+$/.test(t)
  // text-mode escapes (\text{50\% of x\textasciicircum{}2}) back to the characters written
  const raw = String(tex ?? '')
    .replace(/\\textasciicircum\{\}/g, '^')
    .replace(/\\textasciitilde\{\}/g, '~')
    .replace(/\\([%#&_$])/g, '$1')
  let s = texFracs(
    raw,
    (a, b) => `${simple(a) ? a : `(${a})`}/${simple(b) ? b : `(${b})`}`,
    (a, n) => (n === null ? `√(${a})` : n === '3' ? `∛(${a})` : `(${a})^(1/${n})`),
  )
  // ² and ³ only when the whole exponent is 2 or 3; a longer one is bracketed: e^{2x} -> e^(2x)
  s = s.replace(/\^(?:\{\s*2\s*\}|2(?![\d.{]))/g, '²').replace(/\^(?:\{\s*3\s*\}|3(?![\d.{]))/g, '³')
  let prev
  do {
    prev = s
    s = s.replace(/\^\{([^{}]*)\}/g, (_, e) => (/^\s*-?(?:\d+(?:\.\d+)?|[a-zA-Z])\s*$/.test(e) ? `^${e.trim()}` : `^(${e.trim()})`))
  } while (s !== prev)
  s = s.replace(/\\(cdot|times)(?![a-zA-Z])/g, '×').replace(new RegExp(`\\\\(${FN_NAMES})(?![a-zA-Z])`, 'g'), '$1').replace(/\\pi(?![a-zA-Z])/g, 'π')
  s = s.replace(/\\approx(?![a-zA-Z])/g, '≈').replace(/\\pm(?![a-zA-Z])/g, '±').replace(/\\(?:leq?|leqslant)(?![a-zA-Z])/g, '≤').replace(/\\(?:geq?|geqslant)(?![a-zA-Z])/g, '≥').replace(/\\infty(?![a-zA-Z])/g, '∞')
  return s.replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

// A number shown exactly when it can be: 3, 2.5 (a short decimal), 1/3 (a fraction); or else
// rounded, with exact: false (to be written with ≈). preferFraction: 5/2 rather than 2.5.
function smallFraction(v) {
  for (let d = 2; d <= 100; d++) {
    const n = Math.round(v * d)
    if (Math.abs(v * d - n) < 1e-9 * Math.max(1, Math.abs(n))) return [n, d]
  }
  return null
}
function exactNum(v, preferFraction = false) {
  if (isInt(v)) return { tex: fmt(v), plain: fmt(v), exact: true }
  const fr = smallFraction(v)
  const decimals = (d) => Math.abs(v - round(v, d)) < 1e-9 * Math.max(1, Math.abs(v))
  if (fr && (preferFraction || !decimals(3))) return { tex: fracTex(fr[0], fr[1]), plain: `${fr[0]}/${fr[1]}`, exact: true }
  // a decimal as written (1.1111), else rounded
  if (decimals(6)) return { tex: String(round(v, 6)), plain: String(round(v, 6)), exact: true }
  return { tex: fmt(v), plain: fmt(v), exact: false }
}

const round = (v, d = 4) => +Number(v).toFixed(d)
const isInt = (v) => Number.isFinite(v) && Math.abs(v - Math.round(v)) < 1e-9
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a))
const fmt = (v) => (isInt(v) ? String(Math.round(v)) : String(round(v, 3)))
// A decimal written in full when it ends within 6 decimals (0.25 × 0.25 = 0.0625, not 0.063), else
// null: it can only be written rounded, with ≈. The check is on the decimals themselves (only the
// rounding noise of floating point is allowed, a few units in the last place): 1000/3 is
// 333.333333333..., which does not end, however big it is. More than 12 digits can't be told
// from rounding noise: not exact either.
const exactDec = (v) => {
  if (!Number.isFinite(v)) return null
  const r = round(v, 6)
  if (Math.abs(v - r) > Math.max(1e-12, Math.abs(v) * 1e-14)) return null
  return String(r).replace(/^-|\./g, '').replace(/^0+/, '').length <= 12 ? String(r) : null
}
// a/b as LaTeX, reduced
function fracTex(n, d) {
  if (d < 0) [n, d] = [-n, -d]
  const g = gcd(n, d) || 1
  ;[n, d] = [n / g, d / g]
  return d === 1 ? String(n) : `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`
}

// Simpson's rule
function integrate(f, a, b, n = 600) {
  const h = (b - a) / n
  let s = f(a) + f(b)
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2)
  return (s * h) / 3
}

// ------------------------------------------------------------------ the scenes

const THINGS = [
  { emoji: '🍎', one: 'apple', many: 'apples' },
  { emoji: '⭐', one: 'star', many: 'stars' },
  { emoji: '🍬', one: 'sweet', many: 'sweets' },
  { emoji: '🎈', one: 'balloon', many: 'balloons' },
  { emoji: '🐟', one: 'fish', many: 'fish' },
]
const name = (thing, n) => `${n} ${n === 1 ? thing.one : thing.many}`

function buildCount({ a, b, op }, skin) {
  const result = op === '+' ? a + b : a - b
  if (![a, b, result].every((v) => isInt(v) && v >= 0 && v <= 20) || a + b === 0) return null
  if (skin === 'grown') return buildNumberLine({ a, b, op }, skin)
  const thing = THINGS[(a * 7 + b * 3) % THINGS.length]
  const here = `Here ${a === 1 ? 'is' : 'are'} ${name(thing, a)}.`
  const stages =
    op === '+'
      ? [
          { caption: here },
          { caption: `${b} more ${b === 1 ? 'comes' : 'come'} along.` },
          { caption: `Let's count them all together: ${result}!`, math: `${a} + ${b} = ${result}` },
        ]
      : [
          { caption: here },
          { caption: `${b} ${b === 1 ? 'goes' : 'go'} away.` },
          { caption: `Count the ones left: ${result}!`, math: `${a} - ${b} = ${result}` },
        ]
  return { kind: 'count', skin, a, b, op, result, emoji: thing.emoji, stages, resultTex: String(result) }
}

function buildNumberLine({ a, b, op }, skin) {
  const result = op === '+' ? a + b : a - b
  // jumps on a line suit numbers below 100; bigger ones are clearer in columns
  if (![a, b, result].every((v) => isInt(v) && Math.abs(v) < 200) || Math.max(a, b) >= 100) return null
  const dir = op === '+' ? 1 : -1
  // big jumps split into tens and ones, so each jump is easy
  const jumps = []
  const tens = Math.floor(b / 10) * 10
  const ones = b - tens
  if (b > 10 && tens && ones) jumps.push(tens, ones)
  else jumps.push(b)
  const lo = Math.min(a, result)
  const hi = Math.max(a, result)
  const pad = Math.max(1, Math.round((hi - lo) * 0.15))
  let at = a
  const stages = [{ caption: `Start at ${a}.`, at: a }]
  for (const j of jumps) {
    const from = at
    at += dir * j
    stages.push({ caption: `Jump ${j} ${dir > 0 ? 'forward' : 'back'}: from ${from} to ${at}.`, at, jump: { from, to: at } })
  }
  stages.push({ caption: `You land on ${result}.`, at: result, math: `${a} ${op} ${b} = ${result}` })
  return { kind: 'number_line', skin, a, b, op, result, min: lo - pad, max: hi + pad, jumps: stages.filter((s) => s.jump).map((s) => s.jump), stages, resultTex: String(result) }
}

function buildGroups({ a, b }, skin) {
  if (![a, b].every((v) => isInt(v) && v >= 1 && v <= 12)) return null
  const result = a * b
  const counts = Array.from({ length: a }, (_, i) => b * (i + 1))
  const s = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const stages =
    skin === 'grown'
      ? [
          { caption: `${s(a, 'row')}.` },
          { caption: `${b} in each row.` },
          { caption: `${s(a, 'row')} of ${b} ${a === 1 ? 'makes' : 'make'} ${result}.`, math: `${a} \\times ${b} = ${result}` },
        ]
      : [
          { caption: `${s(a, 'plate')}.` },
          { caption: `Put ${s(b, 'cookie')} on each plate.` },
          { caption: `Count in ${b}s: ${counts.slice(0, 6).join(', ')}${a > 6 ? ', and so on' : ''}. That's ${result}!`, math: `${a} \\times ${b} = ${result}` },
        ]
  return { kind: 'groups', skin, a, b, result, counts, stages, resultTex: String(result) }
}

function buildFractions({ n1, d1, n2, d2, op }, skin) {
  if (![n1, d1, n2, d2].every((v) => isInt(v) && v >= 0) || !d1 || !d2 || d1 > 24 || d2 > 24) return null
  const l = (d1 * d2) / gcd(d1, d2)
  if (l > 48) return null
  const m1 = (n1 * l) / d1
  const m2 = (n2 * l) / d2
  const top = op === '+' ? m1 + m2 : m1 - m2
  if (top < 0) return null
  const same = d1 === d2
  const g = gcd(top, l) || 1
  const piece = skin === 'kid' ? 'slices' : 'pieces'
  const stages = [{ caption: `${n1}/${d1} and ${n2}/${d2}.`, math: `\\frac{${n1}}{${d1}} ${op} \\frac{${n2}}{${d2}}` }]
  if (!same) {
    stages.push({
      caption: d1 === l || d2 === l ? `The ${piece} are not the same size. Cut the ${d1 === l ? `${n2}/${d2}` : `${n1}/${d1}`} into ${piece} of ${l}, like the other.` : `The ${piece} are not the same size. Cut both into ${l} equal ${piece}.`,
      cut: true,
    })
    // only the fractions that change are said
    const change = [d1 !== l && `${n1}/${d1} is ${m1}/${l}`, d2 !== l && `${n2}/${d2} is ${m2}/${l}`].filter(Boolean)
    const kept = d1 === l ? ` (${n1}/${d1} already has ${piece} of ${l})` : d2 === l ? ` (${n2}/${d2} already has ${piece} of ${l})` : ''
    stages.push({
      caption: `${change.join(', and ')}.${kept}`,
      cut: true,
      math: [d1 !== l && `\\frac{${n1}}{${d1}} = \\frac{${m1}}{${l}}`, d2 !== l && `\\frac{${n2}}{${d2}} = \\frac{${m2}}{${l}}`].filter(Boolean).join(',\\quad '),
    })
  }
  stages.push({
    caption: op === '+' ? `Now put the ${piece} together: ${m1} + ${m2} = ${top} ${piece} of ${l}.` : `Now take away: ${m1} - ${m2} = ${top} ${piece} of ${l}.`,
    cut: true,
    joined: true,
    math: `\\frac{${m1}}{${l}} ${op} \\frac{${m2}}{${l}} = \\frac{${top}}{${l}}`,
  })
  if (g > 1 && top) stages.push({ caption: l / g === 1 ? `${top}/${l} is ${top / g} whole${top / g === 1 ? '' : 's'}: ${top / g}.` : `Simplify: ${top}/${l} = ${top / g}/${l / g}.`, cut: true, joined: true, simple: { n: top / g, d: l / g }, math: `\\frac{${top}}{${l}} = ${fracTex(top, l)}` })
  return { kind: 'fractions', skin, n1, d1, n2, d2, op, l, m1, m2, top, stages, resultTex: fracTex(top, l) }
}

// Equations: each side is linear in x; found by evaluating it (no algebra system needed).
// Negative and fractional points too, so |x| or sqrt(x^2) are not taken for x.
// Coefficients that are fractions (x/3) are kept exact: 1/3, not 0.333333333.
function snapNum(v) {
  if (isInt(v)) return Math.round(v)
  const fr = smallFraction(v)
  return fr ? fr[0] / fr[1] : round(v, 9)
}
function linear(f) {
  const xs = [0, 1, 2, 7, -3, -1.5, 0.5]
  const ys = xs.map((x) => f(x))
  if (!ys.every(Number.isFinite)) return null
  const [f0, f1] = ys
  const a = f1 - f0
  if (xs.some((x, i) => Math.abs(ys[i] - (a * x + f0)) > 1e-9 * Math.max(1, Math.abs(ys[i]), Math.abs(a * x), Math.abs(f0)))) return null
  return { x: snapNum(a), n: snapNum(f0) }
}
// k·x as text (tex: LaTeX): x, -x, 3x, 0.5x, x/3 (\frac{x}{3}), 2x/3
const xTerm = (k, tex) => {
  if (k === 1 || k === -1) return k < 0 ? '-x' : 'x'
  const sign = k < 0 ? '-' : ''
  const fr = !isInt(k) && Math.abs(k - round(k, 3)) >= 1e-9 * Math.abs(k) && smallFraction(Math.abs(k))
  if (!fr) return `${sign}${exactNum(Math.abs(k)).plain}x`
  const top = `${fr[0] === 1 ? '' : fr[0]}x`
  return tex ? `${sign}\\frac{${top}}{${fr[1]}}` : `${sign}${top}/${fr[1]}`
}
// one side, x·k + n, as text (tex: LaTeX)
const side = ({ x, n }, tex = false) => {
  const num = (v) => exactNum(v)[tex ? 'tex' : 'plain']
  const xs = x === 0 ? '' : xTerm(x, tex)
  if (!xs) return num(n)
  return n === 0 ? xs : `${xs} ${n < 0 ? '-' : '+'} ${num(Math.abs(n))}`
}
const sideTex = (s) => side(s, true)

function buildBalance({ left, right }, skin) {
  let L = left
  let R = right
  if (L.x === R.x) return null // no x, or no single solution
  if (L.x < R.x) [L, R] = [R, L] // keep the x on the left
  const sol = (R.n - L.n) / (L.x - R.x)
  if (!Number.isFinite(sol) || Math.abs(sol) > 1e6) return null
  const state = (l, r) => ({ left: { ...l }, right: { ...r }, eq: `${side(l)} = ${side(r)}` })
  const stages = [{ caption: `Both sides weigh the same: ${side(L)} = ${side(R)}.`, ...state(L, R) }]
  if (R.x !== 0) {
    const k = R.x
    L = { x: L.x - k, n: L.n }
    R = { x: 0, n: R.n }
    stages.push({ caption: k > 0 ? `Take ${xTerm(k)} off both sides, so x is only on the left.` : `Add ${xTerm(-k)} to both sides, so x is only on the left.`, ...state(L, R), math: `${sideTex(L)} = ${sideTex(R)}` })
  }
  if (L.n !== 0) {
    const k = L.n
    L = { x: L.x, n: 0 }
    R = { x: 0, n: R.n - k }
    stages.push({ caption: k > 0 ? `Take ${exactNum(k).plain} off both sides.` : `Add ${exactNum(-k).plain} to both sides.`, ...state(L, R), math: `${sideTex(L)} = ${sideTex(R)}` })
  }
  if (L.x !== 1) {
    const k = L.x
    const rn = exactNum(R.n)
    const kn = exactNum(k)
    stages.push(
      isInt(k)
        ? { caption: `${fmt(k)} x's weigh ${rn.plain}, so one x weighs ${rn.plain} ÷ ${fmt(k)}.`, ...state({ x: 1, n: 0 }, { x: 0, n: R.n / k }), math: `x = \\frac{${rn.tex}}{${fmt(k)}}` }
        : { caption: `Divide both sides by ${kn.plain}.`, ...state({ x: 1, n: 0 }, { x: 0, n: R.n / k }), math: `x = ${rn.tex} \\div ${k < 0 || /frac/.test(kn.tex) ? `\\left(${kn.tex}\\right)` : kn.tex}` },
    )
  }
  // the answer as a fraction when the equation has whole numbers (2x = 5: x = 5/2), else exact if possible
  const ex = Number.isInteger(R.n) && Number.isInteger(L.x) ? { tex: fracTex(R.n, L.x), plain: exactNum(sol, true).plain, exact: true } : exactNum(sol)
  const solTex = isInt(sol) ? fmt(sol) : ex.tex
  const eqTex = ex.exact ? `x = ${solTex}` : `x \\approx ${solTex}`
  stages.push({ caption: `x ${ex.exact ? '=' : '≈'} ${isInt(sol) ? fmt(sol) : ex.plain}. Check: put it back in, both sides are equal.`, ...state({ x: 1, n: 0 }, { x: 0, n: sol }), math: eqTex })
  // blocks and bags only when they can be counted
  const small = [left, right].every((s) => isInt(s.x) && s.x >= 0 && s.x <= 6 && isInt(s.n) && s.n >= 0 && s.n <= 20) && isInt(sol) && sol > 0 && sol <= 20
  return { kind: 'balance', skin: small ? skin : 'grown', solution: sol, stages, resultTex: eqTex }
}

function buildPairs({ n, a, d, l }, skin) {
  // a, a + d, ..., l: the same trick, each pair making a + l
  if (a !== undefined) {
    const count = (l - a) / d + 1
    if (![a, d, l].every(isInt) || d < 1 || !isInt(count) || count < 3 || count > 100000 || (a === 1 && d === 1)) return null
    const total = (count * (a + l)) / 2
    const stages = [
      { caption: `Write the numbers ${a}, ${a + d}, ${a + 2 * d}, … up to ${l}: they go up by ${d}, so there are ${count} of them.`, math: `${a} + ${a + d} + ${a + 2 * d} + \dots + ${l}` },
      { caption: 'Write them again backwards, underneath.' },
      { caption: `Each pair adds up to ${a + l}: ${a} + ${l}, ${a + d} + ${l - d}, ...`, math: `${a} + ${l} = ${a + d} + ${l - d} = \dots = ${a + l}` },
      { caption: `There are ${count} pairs, so both rows make ${count} × ${a + l} = ${count * (a + l)}.`, math: `${count} \times ${a + l} = ${count * (a + l)}` },
      { caption: `That's the sum twice, so halve it: ${total}.`, math: `\frac{${count} \times ${a + l}}{2} = ${total}` },
    ]
    return { kind: 'pairs', skin, n: count, first: a, step: d, last: l, total, stages, resultTex: String(total) }
  }
  if (!isInt(n) || n < 4 || n > 100000) return null
  const total = (n * (n + 1)) / 2
  const stages = [
    { caption: `Write the numbers from 1 to ${n}.` },
    { caption: `Write them again backwards, underneath.` },
    { caption: `Each pair adds up to ${n + 1}: 1 + ${n}, 2 + ${n - 1}, ...`, math: `1 + ${n} = 2 + ${n - 1} = \\dots = ${n + 1}` },
    { caption: `There are ${n} pairs, so both rows make ${n} × ${n + 1} = ${n * (n + 1)}.`, math: `${n} \\times ${n + 1} = ${n * (n + 1)}` },
    { caption: `That's the sum twice, so halve it: ${total}.`, math: `\\frac{${n} \\times ${n + 1}}{2} = ${total}` },
  ]
  return { kind: 'pairs', skin, n, total, stages, resultTex: String(total) }
}

function samples(f, lo, hi, count = 160) {
  const pts = []
  for (let i = 0; i <= count; i++) {
    const x = lo + ((hi - lo) * i) / count
    const y = f(x)
    pts.push([round(x, 5), Number.isFinite(y) && Math.abs(y) < 1e6 ? round(y, 5) : null])
  }
  return pts
}

// A bound of an integral as written when it isn't a plain number (π, 2π, \frac{\pi}{2}: never
// 3.142 with "="), else the number
const boundTex = (v, t) => {
  const w = String(t ?? '').trim()
  return w && !/^-?\d+(?:\.\d+)?$/.test(w) && /pi/.test(w) ? w.replace(/(?<![\\a-zA-Z])pi(?![a-zA-Z])/g, '\\pi') : fmt(v)
}
function buildArea({ f, fTex, a, b, F, FTex, variable = 'x', aTex, bTex }, skin) {
  if (![a, b].every(Number.isFinite) || a === b || Math.abs(b - a) > 1000) return null
  // the function must be finite all along [a, b]
  for (let i = 0; i <= 200; i++) if (!Number.isFinite(f(a + ((b - a) * i) / 200))) return null
  // Simpson's rule with more steps on longer intervals, checked against twice as many: a pole
  // between the sample points (tan x at pi/2, 1/(x^2 - 2)) makes the two disagree, and then
  // there is no area to show (the integral diverges)
  const n = Math.max(600, 2 * Math.ceil(Math.abs(b - a) * 25))
  const v1 = integrate(f, Math.min(a, b), Math.max(a, b), n)
  const v2 = integrate(f, Math.min(a, b), Math.max(a, b), 2 * n)
  if (!Number.isFinite(v1) || !Number.isFinite(v2) || Math.abs(v2 - v1) > 1e-3 * Math.max(1, Math.abs(v2))) return null
  const value = v2 * (b < a ? -1 : 1)
  const span = Math.abs(b - a)
  const lo = Math.min(a, b) - span * 0.25
  const hi = Math.max(a, b) + span * 0.25
  // the antiderivative (from the model) is only shown if F(b) - F(a) matches the area
  let anti = null
  if (F) {
    const diff = F(b) - F(a)
    if (Number.isFinite(diff) && Math.abs(diff - value) <= 1e-4 * Math.max(1, Math.abs(value))) anti = { tex: FTex, Fb: round(F(b)), Fa: round(F(a)) }
  }
  const v = `\\,${variable}`
  const [A, B] = [boundTex(a, aTex), boundTex(b, bTex)]
  const said = (t) => texToPlain(t).replace(/\(([\dπ.]+)\)/g, '$1') // π/2, not (π)/2
  const stages = [
    { caption: `This is the curve y = ${texToPlain(fTex)}.`, show: 'curve', math: `y = ${fTex}` },
    { caption: `The integral is the area under it, from ${variable} = ${said(A)} to ${variable} = ${said(B)}.`, show: 'area', math: `\\int_{${A}}^{${B}} ${fTex}\\,d${v.trim().slice(2)}` },
  ]
  if (anti) {
    stages.push({ caption: `Find a function whose derivative is the curve: F(${variable}) = ${texToPlain(anti.tex)}.`, show: 'area', math: `F(${variable}) = ${anti.tex}` })
    stages.push({ caption: `Area = F(${said(B)}) − F(${said(A)}) ≈ ${fmt(anti.Fb)} − ${fmt(anti.Fa)}.`, show: 'area', math: `F(${B}) - F(${A}) \\approx ${fmt(anti.Fb)} - ${fmt(anti.Fa)}` })
  }
  // below the x-axis an area counts minus: a negative integral (or 0) is said as one, not as "the area"
  const [x0, x1] = [Math.min(a, b), Math.max(a, b)]
  const above = integrate((x) => Math.max(0, f(x)), x0, x1, n)
  const below = integrate((x) => Math.min(0, f(x)), x0, x1, n)
  const none = 1e-6 * Math.max(1, above - below)
  const V = fmt(round(value, 4))
  const end =
    b < a
      ? `The bounds go from right to left, so the sign turns round: the integral is about ${V}.`
      : below > -none
        ? `The area is about ${V}.`
        : above < none
          ? `The curve is below the x-axis there, so the integral is negative: about ${V}.`
          : `The part above the x-axis counts plus, the part below counts minus: together about ${V}.`
  stages.push({ caption: end, show: 'value', math: `\\approx ${V}` })
  const points = samples(f, lo, hi)
  return { kind: 'area', skin, a, b, value: round(value, 6), fTex, antiderivative: anti?.tex, points, plot: plotOf(points, { region: { a, b, value: round(value, 6), when: 'area' }, bounds: { x0: lo, x1: hi } }), stages, resultTex: `\\approx ${fmt(round(value, 4))}` }
}

function buildGraph({ f, fTex }, skin) {
  const lo = -6
  const hi = 6
  const pts = samples(f, lo, hi, 240)
  if (pts.filter(([, y]) => y !== null).length < 60) return null
  // the crossings, from the exact values (not the rounded ones drawn: e^{-36} is not 0), the
  // last point too; a sign change is a root only if f really gets to 0 there (1/x changes
  // sign at its asymptote, and that is no crossing)
  const found = []
  const xs = pts.map(([x]) => x)
  const ys = xs.map((x) => f(x))
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] === 0) {
      found.push(xs[i])
      continue
    }
    if (i === 0 || !Number.isFinite(ys[i - 1]) || !Number.isFinite(ys[i]) || ys[i - 1] === 0 || ys[i - 1] * ys[i] > 0) continue
    let A = xs[i - 1]
    let B = xs[i]
    for (let k = 0; k < 50; k++) {
      const m = (A + B) / 2
      if (f(A) * f(m) <= 0) B = m
      else A = m
    }
    const r = (A + B) / 2
    if (Math.abs(f(r)) <= 1e-6 * Math.max(1, Math.abs(ys[i - 1]), Math.abs(ys[i]))) found.push(r)
  }
  // a curve that only touches the x-axis (9x^2 - 6x + 1 at 1/3) has no sign change: where |f| is
  // smallest between two sample points, it may be 0
  for (let i = 1; i + 1 < xs.length; i++) {
    const [p, q, r] = [ys[i - 1], ys[i], ys[i + 1]].map(Math.abs)
    if (![p, q, r].every(Number.isFinite) || q > p || q > r || ys[i - 1] * ys[i + 1] <= 0) continue
    let A = xs[i - 1]
    let B = xs[i + 1]
    for (let k = 0; k < 80; k++) {
      const m1 = A + (B - A) / 3
      const m2 = B - (B - A) / 3
      if (Math.abs(f(m1)) <= Math.abs(f(m2))) B = m2
      else A = m1
    }
    const x = (A + B) / 2
    if (Math.abs(f(x)) <= 1e-9 * Math.max(1, p, r)) found.push(x)
  }
  // each root once: two found where the curve touches the axis (rounding noise makes it cross
  // twice) are one, and so are roots that are written the same
  const roots = []
  for (const r of found.sort((p, q) => p - q)) {
    const last = roots[roots.length - 1]
    if (last !== undefined && (Math.abs(r - last) < 1e-6 || niceNum(r).tex === niceNum(last).tex)) continue
    roots.push(r)
  }
  const nice = roots.map((r) => niceNum(r, { decimals: true })) // 0.1, 1/3, or about 1.414 (≈)
  const y0 = f(0)
  const yn = Number.isFinite(y0) ? niceNum(y0, { decimals: true }) : null
  const rootsTex = nice.slice(0, 4).map((r) => `x ${r.exact ? '=' : '\\approx'} ${r.tex}`).join(',\\ ')
  const stages = [{ caption: `This is the graph of y = ${texToPlain(fTex)}.`, show: 'curve', math: `y = ${fTex}` }]
  if (yn) stages.push({ caption: `It crosses the y-axis at y ${yn.exact ? '=' : '≈'} ${yn.plain}.`, show: 'y0', math: `x = 0 \\Rightarrow y ${yn.exact ? '=' : '\\approx'} ${yn.tex}` })
  else stages.push({ caption: `At x = 0 there is no value, so it never meets the y-axis.`, show: 'curve', math: `x \\neq 0` })
  if (roots.length) stages.push({ caption: `It ${roots.length === 1 ? 'meets' : 'crosses'} the x-axis at x ${nice.slice(0, 4).every((r) => r.exact) ? '=' : '≈'} ${nice.slice(0, 4).map((r) => r.plain).join(', ')}.`, show: 'roots', math: rootsTex })
  else stages.push({ caption: `It never meets the x-axis: y is never 0.`, show: 'roots', math: `y \\neq 0` })
  const marks = [...(yn ? [{ x: 0, y: round(y0, 4), kind: 'dot', label: `(0, ${yn.plain})`, color: '#ffd34d', when: 'y0' }] : []), ...roots.slice(0, 6).map((r, i) => ({ x: round(r, 6), y: 0, kind: 'dot', label: nice[i].plain, color: '#f47a2a', when: 'roots' }))]
  return { kind: 'graph', skin, fTex, points: pts, roots: roots.slice(0, 6).map((r) => round(r, 6)), y0: Number.isFinite(y0) ? round(y0, 4) : null, plot: plotOf(pts, { markers: marks }), stages, resultTex: roots.length ? rootsTex : '\\text{no roots}' }
}


// ------------------------------------------------------------------ more scenes: up to high school

// 68 x 74: split both numbers into tens and ones, a rectangle of partial products, add them up
function buildAreaModel({ a, b }, skin) {
  if (![a, b].every((v) => isInt(v) && v >= 2 && v <= 9999)) return null
  const split = (n) => {
    const ds = String(n).split('')
    const parts = ds.map((d, i) => Number(d) * 10 ** (ds.length - 1 - i)).filter(Boolean)
    return parts.length ? parts : [n]
  }
  const A = split(a)
  const B = split(b)
  if (A.length * B.length > 16 || (A.length === 1 && B.length === 1)) return null
  const cells = A.flatMap((x, i) => B.map((y, j) => ({ i, j, x, y, p: x * y })))
  const result = a * b
  const stages = [
    { caption: `Split ${a} into ${A.join(' + ')}, and ${b} into ${B.join(' + ')}.`, show: 'split', math: `${a} \\times ${b} = (${A.join(' + ')}) \\times (${B.join(' + ')})` },
    { caption: `Multiply each part: ${cells.map((c) => `${c.x} × ${c.y} = ${c.p}`).join(', ')}.`, show: 'cells', math: cells.map((c) => `${c.x} \\times ${c.y} = ${c.p}`).join(',\\ ') },
    { caption: `Add all the parts: ${cells.map((c) => c.p).join(' + ')} = ${result}.`, show: 'sum', math: `${cells.map((c) => c.p).join(' + ')} = ${result}` },
  ]
  return { kind: 'area_model', skin, a, b, A, B, cells, result, stages, resultTex: String(result) }
}

// 345 + 278 in columns, from the ones: carry a ten when a column makes 10 or more (or borrow)
function buildColumns({ a, b, op }, skin) {
  if (![a, b].every((v) => isInt(v) && v >= 0 && v <= 999999) || (op === '-' && b > a)) return null
  const result = op === '+' ? a + b : a - b
  const width = Math.max(String(a).length, String(b).length, String(result).length)
  const digits = (n) => String(n).padStart(width, ' ').split('').map((d) => (d === ' ' ? null : Number(d)))
  const da = digits(a)
  const db = digits(b)
  const names = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands', 'millions']
  const stages = [{ caption: `Write ${a} and ${b} in columns, ones under ones.`, col: -1, carries: [] }]
  let carry = 0
  const out = Array(width).fill(null)
  const carries = []
  for (let k = 0; k < width; k++) {
    const i = width - 1 - k
    const x = da[i] ?? 0
    const y = db[i] ?? 0
    let caption
    if (op === '+') {
      const sum = x + y + carry
      out[i] = sum % 10
      caption = `${names[k][0].toUpperCase()}${names[k].slice(1)}: ${x} + ${y}${carry ? ` + ${carry}` : ''} = ${sum}.${sum >= 10 ? ` Write ${sum % 10}, carry 1.` : ''}`
      carry = sum >= 10 ? 1 : 0
      if (carry && k < width - 1) carries.push(i - 1)
    } else {
      let top = x - carry
      let borrowed = false
      if (top < y) {
        top += 10
        borrowed = true
      }
      out[i] = top - y
      const Name = `${names[k][0].toUpperCase()}${names[k].slice(1)}`
      if (carry && x === 0) caption = `${Name}: the 0 already lent one, so it borrows a ten itself: 10 − 1 = 9, and 9 − ${y} = ${9 - y}.`
      else if (carry && borrowed) caption = `${Name}: ${x} lent one, so it's ${x - 1}. That's smaller than ${y}, so borrow a ten: ${top} − ${y} = ${top - y}.`
      else if (carry) caption = `${Name}: ${x} lent one, so it's ${x - 1}. ${x - 1} − ${y} = ${top - y}.`
      else if (borrowed) caption = `${Name}: ${x} is smaller than ${y}, so borrow a ten: ${top} − ${y} = ${top - y}.`
      else caption = `${Name}: ${x} − ${y} = ${top - y}.`
      carry = borrowed ? 1 : 0
      if (borrowed) carries.push(i - 1)
    }
    // skip leading empty columns
    if (da[i] === null && db[i] === null && !carry && out[i] === 0) continue
    stages.push({ caption, col: i, digits: [...out], carries: [...carries] })
  }
  stages.push({ caption: `So ${a} ${op === '+' ? '+' : '−'} ${b} = ${result}.`, col: -2, digits: digits(result), carries: [...carries], math: `${a} ${op} ${b} = ${result}` })
  if (stages.length > 9) return null
  return { kind: 'columns', skin, a, b, op, result, width, da, db, stages, resultTex: String(result) }
}

// 24 ÷ 6: share out one at a time; what each gets, and what is left over
function buildSharing({ n, d }, skin) {
  if (![n, d].every((v) => isInt(v)) || d < 1 || d > 12 || n < d || n > 144) return null
  const q = Math.floor(n / d)
  const r = n % d
  const kid = skin !== 'grown' && n <= 60
  const stages = kid
    ? [
        { caption: `${n} sweet${n === 1 ? '' : 's'} to share between ${d} friend${d === 1 ? '' : 's'}.`, show: 'start' },
        { caption: `Give one to each friend, again and again.`, show: 'deal' },
        { caption: `Each friend gets ${q}${r ? `, and ${r} ${r === 1 ? 'is' : 'are'} left over` : ''}.`, show: 'result', math: `${n} \\div ${d} = ${q}${r ? `\\text{ remainder } ${r}` : ''}` },
      ]
    : [
        { caption: `How many groups of ${d} fit in ${n}?`, show: 'start' },
        { caption: `Take away ${d} at a time: ${Array.from({ length: Math.min(q, 6) }, (_, i) => n - d * (i + 1)).join(', ')}${q > 6 ? ', and so on' : ''}.`, show: 'deal' },
        { caption: `${q} group${q === 1 ? '' : 's'}${r ? `, and ${r} left over` : ''}.`, show: 'result', math: `${n} \\div ${d} = ${q}${r ? `\\text{ remainder } ${r}` : ''}` },
      ]
  return { kind: 'sharing', skin: kid ? skin : skin === 'kid' ? 'junior' : skin, n, d, q, r, stages, resultTex: r ? `${q}\\text{ r }${r}` : String(q) }
}

// 20% of 50: a hundred squares, 20 shaded, then the same share of 50
function buildPercent({ p, of }, skin) {
  if (!Number.isFinite(p) || !Number.isFinite(of) || p < 0 || p > 200 || of <= 0 || of > 1e6) return null
  const value = (p * of) / 100
  // the numbers as written (17.5, 2.5) and the value in full (0.4375); ≈ only if it is rounded
  const [P, O] = [p, of].map((v) => exactDec(v) ?? fmt(v))
  const V = exactDec(value)
  const shown = V ?? fmt(round(value, 3))
  const stages = [
    { caption: `${P}% means ${P} out of every 100.`, show: 'grid', math: `${P}\\% = \\frac{${P}}{100}` },
    { caption: `So ${P}% of ${O} is ${P}/100 of ${O}.`, show: 'bar', math: `\\frac{${P}}{100} \\times ${O}` },
    { caption: `That's ${V ? '' : 'about '}${shown}.`, show: 'value', math: `${P}\\% \\text{ of } ${O} ${V ? '=' : '\\approx'} ${shown}` },
  ]
  return { kind: 'percent', skin, p, of, value: round(value, 6), stages, resultTex: V ? V : `\\approx ${shown}` }
}

// 2^5: multiply 2 by itself 5 times. log_2 32: how many 2s make 32?
function buildPowers({ base, exp, log }, skin) {
  if (!isInt(base) || !isInt(exp) || base < 2 || base > 12 || exp < 0 || exp > 12) return null
  const value = base ** exp
  if (value > 1e7) return null
  if (exp === 0) {
    // anything to the power 0 is 1: follow the pattern down, dividing by the base each time
    // (log base b of 1 is 0 for the same reason: b to the power 0 is 1)
    const chain = [base ** 3, base ** 2, base, 1]
    const stages = [
      ...(log ? [{ caption: `log base ${base} of 1 asks: ${base} to what power makes 1?`, show: 0, math: `\\log_{${base}} 1 = \\, ?` }] : []),
      { caption: `Look at the powers of ${base} going down: ${base}³ = ${base ** 3}, ${base}² = ${base ** 2}, ${base}¹ = ${base}.`, show: 3, math: `${base}^3 = ${base ** 3},\\ ${base}^2 = ${base ** 2},\\ ${base}^1 = ${base}` },
      { caption: `Each step down divides by ${base}.`, show: 3, math: `${base ** 3} \\div ${base} = ${base ** 2},\\ ${base ** 2} \\div ${base} = ${base}` },
      { caption: `One more step: ${base} ÷ ${base} = 1. So ${base} to the power 0 is 1.`, show: 4, math: `${base}^0 = ${base} \\div ${base} = 1` },
      ...(log ? [{ caption: `So log base ${base} of 1 is 0.`, show: 4, math: `${base}^{0} = 1 \\Rightarrow \\log_{${base}} 1 = 0` }] : []),
    ]
    return { kind: 'powers', skin, base, exp, value: 1, log: !!log, chain, descending: true, stages, resultTex: log ? '0' : '1' }
  }
  const chain = Array.from({ length: exp }, (_, i) => base ** (i + 1))
  const times = Array(exp).fill(base).join(' \\times ')
  // more than 6: the other multiplications in one step, every product said
  const rest = exp > 6 ? [{ caption: `Keep multiplying by ${base}: ${chain.slice(6).join(', ')}.`, show: exp }] : []
  const stages = log
    ? [
        { caption: `log base ${base} of ${value} asks: how many ${base}s do we multiply to make ${value}?`, show: 0, math: `\\log_{${base}} ${value} = \\, ?` },
        ...chain.slice(0, 6).map((v, i) => ({ caption: i === 0 ? `Start with ${base}.` : `Times ${base} again: ${v}.`, show: i + 1 })),
        ...rest,
        { caption: `${exp} ${base}s make ${value}, so the answer is ${exp}.`, show: exp, math: `${base}^{${exp}} = ${value} \\Rightarrow \\log_{${base}} ${value} = ${exp}` },
      ]
    : [
        { caption: `${base} to the power ${exp} means ${exp} ${base}s multiplied together.`, show: 0, math: `${base}^{${exp}} = ${exp ? times : '1'}` },
        ...chain.slice(0, 6).map((v, i) => ({ caption: i === 0 ? `Start with ${base}.` : `Times ${base}: ${v}.`, show: i + 1 })),
        ...rest,
        { caption: `So ${base} to the power ${exp} is ${value}.`, show: exp, math: `${base}^{${exp}} = ${value}` },
      ]
  return { kind: 'powers', skin, base, exp, value, log: !!log, chain, stages, resultTex: log ? String(exp) : String(value) }
}

// 3 + 4 × 2: brackets first, then powers, then × and ÷, then + and −, left to right
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }
const OPTEX = { '+': '+', '-': '-', '*': '\\times', '/': '\\div', '^': '^' }
function parseOps(src) {
  const toks = String(src).match(/\d+(?:\.\d+)?|[-+*/^()]/g)
  if (!toks || toks.join('') !== String(src).replace(/\s+/g, '')) return null
  let p = 0
  const expr = (min) => {
    let left = atom()
    for (;;) {
      const op = toks[p]
      if (!(op in PREC) || PREC[op] < min) return left
      p++
      const right = expr(op === '^' ? PREC[op] : PREC[op] + 1)
      left = { op, l: left, r: right }
    }
  }
  const atom = () => {
    const t = toks[p++]
    if (t === '(') {
      const e = expr(1)
      if (toks[p++] !== ')') throw new Error('bracket')
      return { ...e, paren: true }
    }
    if (t === '-') {
      // a negative number is just a number (no "0 − 3" step); but the minus of -3^2 comes after
      // the power: -(3^2) = -9, as everywhere else
      if (/^\d/.test(toks[p] ?? '') && toks[p + 1] !== '^') return { v: -Number(toks[p++]) }
      return { op: '-', l: { v: 0 }, r: expr(PREC['^']), neg: true }
    }
    if (t === undefined || !/^\d/.test(t)) throw new Error('number expected')
    return { v: Number(t) }
  }
  try {
    const tree = expr(1)
    return p === toks.length ? tree : null
  } catch {
    return null
  }
}
// the values are exact (a step that isn't is refused): 0.0625 in full
const numTex = (v) => exactDec(v) ?? fmt(v)
// A negative number keeps brackets where it would read wrong without them: (-3)^2 (not -3^2,
// which is -9), 2 × (-3), 5 - (-2); and the ones written around it
const texOf = (n, hl, wrap = false) => {
  if (n === hl) return `\\underbrace{${texOf({ ...n, paren: false })}}_{${numTex(evalNode(n))}}`.replace(/^/, n.paren ? '\\left(' : '').replace(/$/, n.paren ? '\\right)' : '')
  if ('v' in n) return n.v < 0 && (wrap || n.paren) ? `\\left(${numTex(n.v)}\\right)` : numTex(n.v)
  const inner =
    n.op === '^'
      ? `${texOf(n.l, hl, true)}^{${texOf('v' in n.r ? { ...n.r, paren: false } : n.r, hl)}}`
      : n.neg
        ? `-${texOf(n.r, hl)}`
        : `${texOf(n.l, hl)} ${OPTEX[n.op]} ${texOf(n.r, hl, true)}`
  return n.paren ? `\\left(${inner}\\right)` : inner
}
function evalNode(n) {
  if ('v' in n) return n.v
  const a = evalNode(n.l)
  const b = evalNode(n.r)
  return { '+': a + b, '-': a - b, '*': a * b, '/': a / b, '^': a ** b }[n.op]
}
function buildOrderOps({ expression }, skin) {
  const tree = parseOps(toExpr(expression).replace(/=.*$/, ''))
  if (!tree || 'v' in tree) return null
  const count = (n) => ('v' in n ? 0 : 1 + count(n.l) + count(n.r))
  const hasParen = (n) => !('v' in n) && (n.paren || hasParen(n.l) || hasParen(n.r))
  const ops = new Set()
  const walk = (n) => !('v' in n) && (ops.add(n.neg ? 'neg' : n.op), walk(n.l), walk(n.r))
  walk(tree)
  // a single operation has its own animation (but not with a negative number: 3 - (-2)), and so
  // does the same one again (2 + 2 + 2); two of the same level are worked left to right
  // (8 ÷ 2 × 4, 10 − 3 + 2)
  const negative = (n) => ('v' in n ? n.v < 0 : negative(n.l) || negative(n.r))
  if (count(tree) < 1 || (count(tree) === 1 && !negative(tree)) || (count(tree) > 1 && ops.size < 2 && !hasParen(tree))) return null
  // plus or minus still to do (a minus sign in front of a number is no subtraction)
  const hasPlus = (n) => !('v' in n) && ((!n.neg && PREC[n.op] === 1) || hasPlus(n.l) || hasPlus(n.r))
  // the minus in front of a value that is ready is folded into it, with no step: -(9) is -9
  const fold = (n) => ('v' in n ? n : n.neg && 'v' in n.r ? { v: -n.r.v } : { ...n, l: fold(n.l), r: fold(n.r) })
  const stages = []
  let t = fold(structuredClone(tree))
  for (let guard = 0; guard < 8 && !('v' in t); guard++) {
    // the next operation: inside brackets first, then the highest precedence, leftmost
    const ready = []
    const find = (n, depth) => {
      if ('v' in n) return
      if ('v' in n.l && 'v' in n.r) ready.push({ n, depth: depth + (n.paren ? 1 : 0) })
      find(n.l, depth + (n.paren ? 1 : 0))
      find(n.r, depth + (n.paren ? 1 : 0))
    }
    find(t, 0)
    ready.sort((x, y) => y.depth - x.depth || PREC[y.n.op] - PREC[x.n.op])
    const next = ready[0].n
    const value = evalNode(next)
    // every step exact (1 ÷ 3 can't be written in full: no animation)
    if (!Number.isFinite(value) || Math.abs(value) > 1e9 || exactDec(value) === null) return null
    // "left to right" only when there are two of that level to do
    const level = (n, k) => ('v' in n ? 0 : (!n.neg && PREC[n.op] === k ? 1 : 0) + level(n.l, k) + level(n.r, k))
    const then = stages.length ? 'Then plus and minus' : 'Plus and minus'
    const why = next.paren
      ? 'Brackets first'
      : next.op === '^'
        ? 'Powers next'
        : PREC[next.op] === 2
          ? hasPlus(t) ? 'Times and divide before plus and minus' : level(t, 2) > 1 ? 'Times and divide, left to right' : stages.length ? 'Then times and divide' : 'Times and divide'
          : level(t, 1) > 1 ? `${then}, left to right` : then
    const [a, b] = [evalNode(next.l), evalNode(next.r)]
    const said = (v, wrap) => (v < 0 && wrap ? `(${numTex(v)})` : numTex(v))
    // -3^2: the power first, then the minus in front of it (-9, not 9)
    const underMinus = (n) => !('v' in n) && ((n.neg && n.r === next) || underMinus(n.l) || underMinus(n.r))
    const minus = underMinus(t) ? ` The minus sign in front makes it ${numTex(-value)}.` : ''
    stages.push({ caption: `${why}: ${said(a, next.op === '^')} ${{ '+': '+', '-': '−', '*': '×', '/': '÷', '^': 'to the power' }[next.op]} ${said(b, next.op !== '^')} = ${numTex(value)}.${minus}`, math: texOf(t, next) })
    const replace = (n) => (n === next ? { v: value } : 'v' in n ? n : { ...n, l: replace(n.l), r: replace(n.r) })
    t = fold(replace(t))
  }
  if (!('v' in t)) return null
  stages.push({ caption: `The answer is ${numTex(t.v)}.`, math: `${texOf(tree, null)} = ${numTex(t.v)}` })
  return { kind: 'order_ops', skin, start: texOf(tree, null), result: t.v, stages, resultTex: numTex(t.v) }
}

// a^2 + b^2 = c^2 with squares drawn on the three sides of a right triangle
function buildPythagoras({ a, b, c }, skin) {
  let A = a
  let B = b
  let C = c
  const known = [A, B, C].filter((v) => Number.isFinite(v)).length
  if (known !== 2) return null
  let missing
  if (!Number.isFinite(C)) {
    C = Math.sqrt(A * A + B * B)
    missing = 'c'
  } else if (!Number.isFinite(B)) {
    if (C <= A) return null
    B = Math.sqrt(C * C - A * A)
    missing = 'b'
  } else return null
  if (![A, B, C].every((v) => v > 0 && v < 1e4)) return null
  const sq = (v) => fmt(round(v * v, 4))
  // exact when the side is a whole number or a short decimal (6.5, 0.8), else ≈
  const exact = (v) => Math.abs(v - round(v, 3)) < 1e-9 * Math.max(1, v)
  const stages = [
    { caption: `A right-angled triangle: the two short sides are ${fmt(A)} and ${missing === 'b' ? '?' : fmt(B)}${missing === 'b' ? `, the long side is ${fmt(C)}` : ''}.`, show: 'triangle' },
    { caption: `Draw a square on each side. Their areas are the sides squared.`, show: 'squares', math: missing === 'c' ? `${fmt(A)}^2 = ${sq(A)},\\ ${fmt(B)}^2 = ${sq(B)}` : `${fmt(A)}^2 = ${sq(A)},\\ ${fmt(C)}^2 = ${sq(C)}` },
    { caption: `The big square is as big as the two small ones together: a² + b² = c².`, show: 'squares', math: `a^2 + b^2 = c^2` },
    missing === 'c'
      ? { caption: `${sq(A)} + ${sq(B)} = ${sq(C)}, so the long side is √${sq(C)} ${exact(C) ? '=' : '≈'} ${fmt(round(C, 3))}.`, show: 'answer', math: `c = \\sqrt{${sq(A)} + ${sq(B)}} = ${exact(C) ? fmt(C) : `\\sqrt{${sq(C)}} \\approx ${fmt(round(C, 3))}`}` }
      : { caption: `${sq(C)} − ${sq(A)} = ${sq(B)}, so the missing side is √${sq(B)} ${exact(B) ? '=' : '≈'} ${fmt(round(B, 3))}.`, show: 'answer', math: `b = \\sqrt{${sq(C)} - ${sq(A)}} = ${exact(B) ? fmt(B) : `\\sqrt{${sq(B)}} \\approx ${fmt(round(B, 3))}`}` },
  ]
  const ans = missing === 'c' ? C : B
  return { kind: 'pythagoras', skin, a: A, b: B, c: C, missing, stages, resultTex: exact(ans) ? fmt(ans) : `\\approx ${fmt(round(ans, 3))}` }
}

// The mean: towers of the numbers, added up, then shared out equally until they are level
function buildMean({ values }, skin) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 12 || !values.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6)) return null
  const sum = values.reduce((s, v) => s + v, 0)
  const mean = sum / values.length
  // the numbers as written, the total in full; a mean that doesn't end (5 ÷ 3) is a fraction, ≈ its value
  const show = (v) => exactDec(v) ?? fmt(v)
  const vs = values.map(show)
  const S = show(sum)
  const n = values.length
  const exact = exactDec(mean)
  const approx = fmt(round(mean, 3))
  const fr = !exact && isInt(sum) ? fracTex(Math.round(sum), n) : null
  const meanTex = exact ?? `${fr ? `${fr} ` : ''}\\approx ${approx}`
  const stages = [
    { caption: `Here are the ${n} numbers as towers: ${vs.join(', ')}.`, show: 'towers' },
    { caption: `Add them all up: ${vs.join(' + ')} = ${S}.`, show: 'towers', math: `${vs.join(' + ')} = ${S}` },
    { caption: `Share the total equally: ${S} ÷ ${n} ${exact ? `= ${exact}` : `≈ ${approx}`}. Now every tower is the same height.`, show: 'level', math: `\\bar{x} = \\frac{${S}}{${n}}${exact ? ` = ${exact}` : `${fr && fr !== `\\frac{${S}}{${n}}` ? ` = ${fr}` : ''} \\approx ${approx}`}` },
  ]
  return { kind: 'mean', skin, values, sum, mean: round(mean, 6), stages, resultTex: meanTex }
}

// 2x + 3 > 7: solved like an equation (dividing by a negative flips the sign), then a ray
const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }
const RELTEX = { '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' }
const RELWORD = { '<': 'less than', '>': 'more than', '<=': 'at most', '>=': 'at least' }
const RELSYM = { '<': '<', '>': '>', '<=': '≤', '>=': '≥' }
function buildInequality({ left, right, rel }, skin) {
  let L = left
  let R = right
  let r = rel
  if (L.x === R.x) return null
  const line = () => `${sideTex(L)} ${RELTEX[r]} ${sideTex(R)}`
  const stages = [{ caption: `Solve it like an equation, but keep the ${RELSYM[r]} sign.`, math: line() }]
  if (R.x !== 0) {
    const k = R.x
    L = { x: L.x - k, n: L.n }
    R = { x: 0, n: R.n }
    stages.push({ caption: k > 0 ? `Take ${xTerm(k)} from both sides.` : `Add ${xTerm(-k)} to both sides.`, math: line() })
  }
  if (L.n !== 0) {
    const k = L.n
    L = { x: L.x, n: 0 }
    R = { x: 0, n: R.n - k }
    stages.push({ caption: k > 0 ? `Take ${exactNum(k).plain} from both sides.` : `Add ${exactNum(-k).plain} to both sides.`, math: line() })
  }
  const k = L.x
  const v = R.n / k
  // the boundary exactly when it can be (x < 1/3); else as the division, ≈ its value
  const b = exactNum(v)
  const bTex = b.exact ? b.tex : `\\frac{${exactNum(R.n).tex}}{${exactNum(k).tex}} \\approx ${fmt(round(v, 4))}`
  if (k !== 1) {
    if (k < 0) r = FLIP[r]
    stages.push({ caption: k < 0 ? `Divide by ${exactNum(k).plain}. Dividing by a negative number flips the sign!` : `Divide both sides by ${exactNum(k).plain}.`, math: `x ${RELTEX[r]} ${bTex}` })
  }
  stages.push({ caption: `x is ${RELWORD[r]} ${b.exact ? b.plain : `${exactNum(R.n).plain} ÷ ${exactNum(k).plain}, about ${fmt(round(v, 4))}`}: all the numbers on this part of the line.`, show: 'ray', math: `x ${RELTEX[r]} ${bTex}` })
  return { kind: 'inequality', skin, value: round(v, 6), rel: r, stages, resultTex: `x ${RELTEX[r]} ${bTex}` }
}

// sin, cos, tan on the unit circle
const EXACT = {
  0: ['0', '1', '0'],
  30: ['\\frac{1}{2}', '\\frac{\\sqrt{3}}{2}', '\\frac{\\sqrt{3}}{3}'],
  45: ['\\frac{\\sqrt{2}}{2}', '\\frac{\\sqrt{2}}{2}', '1'],
  60: ['\\frac{\\sqrt{3}}{2}', '\\frac{1}{2}', '\\sqrt{3}'],
  90: ['1', '0', null],
}
function exactTrig(fn, deg) {
  const d = ((deg % 360) + 360) % 360
  const ref = d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d
  const e = EXACT[ref]
  if (!e) return null
  const i = { sin: 0, cos: 1, tan: 2 }[fn]
  if (e[i] === null) return 'undefined'
  const sign = fn === 'sin' ? (d > 180 ? -1 : 1) : fn === 'cos' ? (d > 90 && d < 270 ? -1 : 1) : (d > 90 && d < 180) || d > 270 ? -1 : 1
  return e[i] === '0' ? '0' : `${sign < 0 ? '-' : ''}${e[i]}`
}
function buildTrig({ fn, deg }, skin) {
  if (!['sin', 'cos', 'tan'].includes(fn) || !Number.isFinite(deg) || Math.abs(deg) > 720) return null
  const t = (deg * Math.PI) / 180
  const cos = round(Math.cos(t), 6)
  const sin = round(Math.sin(t), 6)
  const value = fn === 'sin' ? sin : fn === 'cos' ? cos : Math.abs(cos) < 1e-9 ? null : round(sin / cos, 6)
  const exact = exactTrig(fn, deg)
  // any other angle has a value that never ends (sin 15° = 0.2588...): written with ≈
  const approx = value !== null && exact === null
  const valTex = value === null ? '\\text{undefined}' : exact ?? fmt(round(value, 4))
  const rounded = [cos, sin].some((v) => Math.abs(v - round(v, 3)) > 1e-9)
  const stages = [
    { caption: `Draw a circle with radius 1 around the centre.`, show: 'circle' },
    { caption: `Turn ${fmt(Math.abs(deg))}° from the right-hand side, ${deg < 0 ? 'clockwise' : 'anticlockwise'}.`, show: 'angle', math: `\\theta = ${fmt(deg)}^\\circ` },
    { caption: `The point on the circle is (cos θ, sin θ) ${rounded ? '≈' : '='} (${fmt(round(cos, 3))}, ${fmt(round(sin, 3))}).`, show: 'point', math: `(\\cos ${fmt(deg)}^\\circ,\\ \\sin ${fmt(deg)}^\\circ)` },
    { caption: fn === 'sin' ? `sin is how high the point is.` : fn === 'cos' ? `cos is how far across the point is.` : `tan is how high divided by how far across.`, show: fn, math: `\\${fn} ${fmt(deg)}^\\circ ${approx ? '\\approx' : '='} ${valTex}` },
  ]
  return { kind: 'trig', skin, fn, deg, cos, sin, value, stages, resultTex: approx ? `\\approx ${valTex}` : valTex }
}

// A plot (area, graph, quadratic, limit, derivative, system): curves and overlays, each with
// the step it appears at (`when`).
function plotOf(points, extra = {}) {
  return { points, extra: [], markers: [], ...extra }
}

// x^2 - 5x + 6 = 0: the parabola, the discriminant, and the roots where it meets the x-axis
// (-B ± √D) / 2A for whole numbers with D > 0 not a square, simplified: x^2 = 2 -> -\sqrt{2}, \sqrt{2}
function surdRoots(A, B, D) {
  let k = 1
  let m = D
  for (let q = 2; q * q <= m; q++) {
    while (m % (q * q) === 0) {
      m /= q * q
      k *= q
    }
  }
  // the ± makes (-B ± k√m) / 2A the same pair as (B ± k√m) / -2A: keep the bottom positive
  let p = A > 0 ? -B : B
  let q = k
  let r = Math.abs(2 * A)
  const g = gcd(gcd(Math.abs(p), q), r) || 1
  ;[p, q, r] = [p / g, q / g, r / g]
  const rt = `${q === 1 ? '' : q}\\sqrt{${m}}`
  const one = (s) => {
    if (p === 0) return `${s < 0 ? '-' : ''}${r === 1 ? rt : `\\frac{${rt}}{${r}}`}`
    const top = `${p} ${s < 0 ? '-' : '+'} ${rt}`
    return r === 1 ? top : `\\frac{${top}}{${r}}`
  }
  return [one(-1), one(1)]
}

function buildQuadratic({ A, B, C, eq }, skin) {
  if (![A, B, C].every(Number.isFinite) || Math.abs(A) < 1e-12) return null
  // a discriminant that is 0 but for rounding (x^2 + 0.2x + 0.01 = 0) is 0: one root, not none or two
  const D0 = B * B - 4 * A * C
  const D = Math.abs(D0) <= 1e-9 * Math.max(1, B * B, Math.abs(4 * A * C)) ? 0 : D0
  const f = (x) => A * x * x + B * x + C
  const vx = -B / (2 * A)
  const roots = D < 0 ? [] : D === 0 ? [vx] : [(-B - Math.sqrt(D)) / (2 * A), (-B + Math.sqrt(D)) / (2 * A)].sort((p, q) => p - q)
  const span = Math.max(3, ...roots.map((r) => Math.abs(r - vx) * 1.6))
  const points = samples(f, vx - span, vx + span, 200)
  const co = (v) => exactNum(v).tex
  // (no "+ 0x" or "1x": x^2 + 1, x^2 - x)
  const poly = `${co(A) === '1' ? '' : co(A) === '-1' ? '-' : co(A)}x^2${B ? ` ${B < 0 ? '-' : '+'} ${co(Math.abs(B)) === '1' ? '' : co(Math.abs(B))}x` : ''}${C ? ` ${C < 0 ? '-' : '+'} ${co(Math.abs(C))}` : ''}`
  // the roots exactly: whole numbers and fractions (6x^2 - 5x + 1 = 0: 1/3 and 1/2), square roots
  // when the coefficients are whole numbers (x^2 = 2: ±√2), else rounded with ≈
  const whole = [A, B, C].every(Number.isInteger)
  const surd = whole && D > 0 && D <= 1e9 && !Number.isInteger(Math.sqrt(D)) ? surdRoots(A, B, D) : null
  const shown = roots.map((r, i) => {
    const approx = fmt(round(r, 3))
    if (surd) return { eq: `x = ${surd[i]}`, math: `x = ${surd[i]} \\approx ${approx}`, plain: `${texToPlain(surd[i])} ≈ ${approx}` }
    const e = exactNum(r, whole)
    return e.exact ? { eq: `x = ${e.tex}`, math: `x = ${e.tex}`, plain: e.plain } : { eq: `x \\approx ${approx}`, math: `x \\approx ${approx}`, plain: `about ${approx}` }
  })
  const par = (v) => (v < 0 ? `(${exactNum(v).plain})` : exactNum(v).plain)
  const dShow = (v) => (exactNum(v).exact ? exactNum(v) : { plain: String(+v.toPrecision(4)), tex: String(+v.toPrecision(4)) })
  const stages = [
    { caption: `Draw y = ${texToPlain(poly)}: a parabola.`, show: 'curve', math: `y = ${poly}` },
    { caption: `The answers are where the curve crosses the x-axis, where y = 0.`, show: 'curve', math: `${poly} = 0` },
    { caption: `Discriminant: b² − 4ac = ${par(B)}² − 4 × ${par(A)} × ${par(C)} = ${dShow(D).plain}.${D < 0 ? ' It is negative, so the curve never touches the x-axis.' : ''}`, show: 'curve', math: `\\Delta = b^2 - 4ac = ${dShow(D).tex}` },
    D < 0
      ? { caption: `No real solution.`, show: 'curve', math: `\\Delta < 0` }
      : { caption: `x = (−b ± √Δ) / 2a gives ${shown.map((s) => s.plain).join(' and ')}.`, show: 'roots', math: `x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} \\Rightarrow ${shown.map((s) => s.math).join(',\\ ')}` },
  ]
  return {
    kind: 'quadratic',
    skin,
    A,
    B,
    C,
    D,
    roots: roots.map((r) => round(r, 6)),
    plot: plotOf(points, { markers: [...roots.map((r) => ({ x: round(r, 6), y: 0, kind: 'dot', label: fmt(round(r, 3)), color: '#f47a2a', when: 'roots' })), { x: round(vx, 6), y: round(f(vx), 6), kind: 'dot', label: 'vertex', color: '#ffd34d', when: 'roots' }] }),
    stages,
    resultTex: roots.length ? shown.map((s) => s.eq).join(',\\ ') : '\\text{no real solution}',
  }
}

// A computed value (a limit, a slope, a root) as LaTeX: whole numbers and fractions exactly, else
// rounded, with exact: false (it is then written with ≈, never "="). Simple fractions (bottoms up
// to 12) are found even in a value that is only close (a limit is an estimate); bigger bottoms
// (1/13, 11/13) only when the value is that fraction to the last digits. decimals: a decimal
// that ends is written as one (0.1, not 1/10: a graph of y = x^2 - 0.2x + 0.01).
function niceNum(v, { decimals = false } = {}) {
  if (!Number.isFinite(v)) return { tex: v > 0 ? '\\infty' : '-\\infty', plain: v > 0 ? '∞' : '-∞', exact: true }
  // (to 1e-7: a root where the curve only touches the axis is found that precisely)
  const r4 = round(v, 4)
  if (decimals && !isInt(v) && Math.abs(v - r4) < 1e-7) return { tex: String(r4), plain: String(r4), exact: true }
  for (let d = 1; d <= 100; d++) {
    const n = Math.round(v * d)
    if (Math.abs(n / d - v) < (d <= 12 ? 1e-6 : 1e-9 * Math.max(1, Math.abs(v)))) {
      const g = gcd(n, d) || 1
      return { tex: fracTex(n, d), plain: d / g === 1 ? String(n / g) : `${n / g}/${d / g}`, exact: true }
    }
  }
  return { tex: fmt(round(v, 4)), plain: fmt(round(v, 4)), exact: false }
}
const niceTex = (v) => niceNum(v).tex
// "lhs = value", or "lhs ≈ value" when the value is rounded
const niceEq = (lhs, v) => {
  const x = niceNum(v)
  return `${lhs} ${x.exact ? '=' : '\\approx'} ${x.tex}`
}

// Where values taken closer and closer in head (each step ten times closer: x = a ± 10^-k, or
// x = ±10^k towards infinity): { L } a number, +/-Infinity, or NaN (they don't settle), and
// undef when not one of them can be computed (√x left of 0). Floating point spoils the closest
// values (at x = 1e-8, 1 - cos x is exactly 0), so the estimate comes from where the values are
// steadiest: Aitken's extrapolation (errors like a power of the step: x², √x) or one in 1/k
// (1/ln x), whichever settles best.
// Does f keep swinging near a? The spread between f at a ± 10^-k and at points in between
// (a ± 1.37·10^-k, ...) must shrink as k grows; for a wave like sin(π/x) it doesn't.
function swings(f, a, inf, one) {
  const C = [Math.SQRT2, Math.E / 2, Math.PI / 2, 8 / 7] // never whole numbers, even times 10^6
  const at = (k, c, dir) => (inf ? Math.sign(a) * c * 10 ** k : a + dir * c * 10 ** -k)
  for (const dir of inf ? [1] : one === '+' ? [1] : one === '-' ? [-1] : [-1, 1]) {
    const spread = (k) => {
      const base = f(at(k, 1, dir))
      const ys = C.map((c) => f(at(k, c, dir)))
      return Number.isFinite(base) && ys.every(Number.isFinite) ? Math.max(...ys.map((y) => Math.abs(y - base))) : null
    }
    const [s3, s6] = [spread(3), spread(6)]
    if (s3 === null || s6 === null) continue
    if (s6 > 0.05 * Math.max(1, Math.abs(f(at(6, 1, dir)))) && s6 > 0.5 * s3) return true
  }
  return false
}

function settle(raw) {
  if (!raw.some(Number.isFinite)) {
    const last = raw[raw.length - 1]
    return Math.abs(last) === Infinity && raw.every((y) => y === last) ? { L: last } : { L: NaN, undef: raw.every(Number.isNaN) }
  }
  // the usable run: after any gap, up to an overflow, or to a sudden 0 (the numerator
  // cancelled to nothing while the values were steady)
  let v = []
  for (let i = 0; i < raw.length; i++) {
    const y = raw[i]
    if (!Number.isFinite(y)) {
      const rest = raw.slice(i)
      if (Math.abs(y) === Infinity && rest.every((z) => z === y)) {
        // an overflow (e^x): infinity, if the values were shooting up that way; after
        // steady values it is a division by a 0 that is only rounding (x^2 / (1 - cos x))
        const [q, p] = [v[v.length - 2]?.[1], v[v.length - 1]?.[1]]
        if (p === undefined || (Math.sign(p) === Math.sign(y) && (q === undefined || (Math.sign(q) === Math.sign(p) && Math.abs(p) > 10 * Math.abs(q))))) return { L: y }
      }
      if (rest.every((z) => !Number.isFinite(z))) break
      v = []
      continue
    }
    const n = v.length
    if (y === 0 && n >= 2 && v[n - 1][1] !== 0) {
      const [p, q] = [v[n - 1][1], v[n - 2][1]]
      if (Math.abs(p) >= Math.abs(q) || Math.abs(p) > 10 * Math.abs(p - q)) break
    }
    v.push([i + 1, y])
  }
  const ys = v.map(([, y]) => y)
  if (ys.length < 3) return { L: NaN }
  // growing without end: one sign, bigger and bigger, by steps that don't shrink (ln x, 1/x)
  const tail = ys.slice(-4)
  const d = tail.slice(1).map((y, i) => y - tail[i])
  const grows =
    tail.every((y) => y !== 0 && Math.sign(y) === Math.sign(tail[0])) &&
    tail.slice(1).every((y, i) => Math.abs(y) > Math.abs(tail[i])) &&
    d.slice(1).every((x, i) => Math.abs(x) >= 0.9 * Math.abs(d[i])) &&
    Math.abs(tail[tail.length - 1]) > 5
  if (grows) return { L: Math.sign(tail[0]) * Infinity }
  // settling: two estimates in a row that agree, from values whose steps shrink (or are only
  // rounding): the values themselves, Richardson's (errors in powers of the step: sin x / x),
  // Aitken's (any power: √x, x^(1/3)) or in 1/k (1/ln x)
  let best = null
  for (let i = 0; i + 3 < ys.length; i++) {
    const w = ys.slice(i, i + 4)
    const dw = w.slice(1).map((y, j) => y - w[j])
    const floor = 1e-7 * Math.max(1, ...w.map(Math.abs))
    if (!(Math.abs(dw[1]) <= Math.abs(dw[0]) + floor && Math.abs(dw[2]) <= Math.abs(dw[1]) + floor)) continue
    const aitken = (j) => {
      const den = dw[j + 1] - dw[j]
      return den === 0 ? w[j + 2] : w[j + 2] - (dw[j + 1] * dw[j + 1]) / den
    }
    const r1 = (j) => (10 * w[j + 1] - w[j]) / 9
    const richardson = (j) => (100 * r1(j + 1) - r1(j)) / 99
    const k = v[i][0]
    const harmonic = (j) => (k + j + 1) * w[j + 1] - (k + j) * w[j]
    for (const [e1, e2] of [[w[2], w[3]], [richardson(0), richardson(1)], [aitken(0), aitken(1)], [harmonic(1), harmonic(2)]]) {
      const s = Math.abs(e2 - e1)
      if (Number.isFinite(s) && (!best || s < best.s)) best = { s, L: e2 }
    }
  }
  return best && best.s <= 1e-6 * Math.max(1, Math.abs(best.L)) ? { L: best.L } : { L: NaN }
}

// a value for a caption: 0.316, or 2.69 × 10^43 when it is huge
const bigFmt = (y) => {
  if (Math.abs(y) < 1e6) return fmt(round(y, 4))
  const e = Math.floor(Math.log10(Math.abs(y)))
  return `${fmt(round(y / 10 ** e, 2))} × 10^${e}`
}

// and 1.2 × 10^-7 when it is tiny (never "1.2e-7")
const tiny = (y) => {
  const e = Math.floor(Math.log10(Math.abs(y)))
  return `${fmt(round(y / 10 ** e, 2))} × 10^${e}`
}

// lim x->a f(x): values from the left and from the right, closer and closer; the hole at a
function buildLimit({ f, fTex, a, variable = 'x', side = null }, skin) {
  if (typeof a !== 'number' || Number.isNaN(a)) return null // a target that isn't a number (c, "0,5" misread)
  const inf = !Number.isFinite(a)
  const hs = [0.5, 0.1, 0.01, 0.001]
  let L
  let tl = null
  let tr = null
  let left = []
  let right = []
  // a two-sided limit where f is only defined on one side (√x at 0): taken from that side
  let forced = null
  if (inf) {
    const s = Math.sign(a)
    right = [10, 100, 1000, 100000].map((x) => [s * x, f(s * x)])
    L = settle(Array.from({ length: 16 }, (_, k) => f(s * 10 ** (k + 1)))).L
  } else {
    const near = (dir) => settle(Array.from({ length: 8 }, (_, k) => f(a + dir * 10 ** -(k + 1))))
    const sl = side === '+' ? null : near(-1)
    const sr = side === '-' ? null : near(1)
    if ((sl ? sl.undef : true) && (sr ? sr.undef : true)) return null
    if (!side && (sl.undef || sr.undef)) forced = sl.undef ? '+' : '-'
    tl = sl && !sl.undef ? sl.L : null
    tr = sr && !sr.undef ? sr.L : null
    const one = side || forced
    if (one) L = one === '+' ? tr : tl
    else if (Number.isNaN(tl) || Number.isNaN(tr)) L = NaN
    else if (!Number.isFinite(tl) || !Number.isFinite(tr)) L = tl === tr ? tl : NaN
    else L = Math.abs(tl - tr) < 1e-3 * Math.max(1, Math.abs(tl)) ? (tl + tr) / 2 : NaN
    left = one === '+' ? [] : hs.map((h) => [a - h, f(a - h)])
    right = one === '-' ? [] : hs.map((h) => [a + h, f(a + h)])
  }
  // values taken only at a ± 10^-k can all land on the same point of a wave (sin(π/x) is 0 at
  // every one of them): points as close in, in between, must agree too, or there is no limit
  const swinging = Number.isFinite(L) && swings(f, a, inf, inf ? null : side || forced)
  if (swinging) L = NaN
  const one = inf ? null : side || forced
  const Lnum = Number.isNaN(L) ? null : niceNum(L)
  const Ltex = Lnum ? Lnum.tex : '\\text{does not exist}'
  // "= 1/13", or "≈ 2.718" when the limit can only be written rounded
  const isL = Lnum && !Lnum.exact ? '\\approx' : '='
  const Lsaid = Lnum ? (Lnum.exact ? Lnum.plain : `about ${Lnum.plain}`) : ''
  const fa = inf ? NaN : f(a)
  const defined = Number.isFinite(fa)
  const finiteL = Number.isFinite(L)
  const asymptote = [tl, tr].some((t) => t === Infinity || t === -Infinity)
  const lo = inf ? (a > 0 ? 0 : -20) : a - 3
  const hi = inf ? (a > 0 ? 20 : 0) : a + 3
  const points = samples(f, lo, hi, 240)
  const v = variable
  const pa = inf ? '' : fmt(a)
  // a value read out: never rounded onto the limit itself (sin x / x at 0.01 is 0.99998, not 1)
  const near = (y) => {
    if (Math.abs(y) >= 1e6 || !finiteL || Math.abs(y - L) < 1e-12) return bigFmt(y)
    // small values keep three digits that matter (0.0769, not 0.077)
    for (let d = 3 + Math.max(0, -Math.floor(Math.log10(Math.abs(y) || 1)) - 1); d <= 12; d++) {
      const r = round(y, d)
      if (Math.abs(r - L) > 1e-12 && (!isInt(r) || isInt(y))) return /e/.test(String(r)) ? tiny(r) : String(r)
    }
    return String(round(y, 9))
  }
  // only values that exist are read out (never "NaN")
  const row = (pts) => pts.filter(([, y]) => Number.isFinite(y)).map(([x, y]) => `f(${fmt(round(x, 3))}) = ${near(y)}`).slice(-3).join(', ') || 'the values are too big to write'
  const plain = texToPlain(fTex)
  const from = one === '+' ? 'From the right' : 'From the left'
  const toTex = inf ? `${a > 0 ? '' : '-'}\\infty` : `${pa}${one ? `^{${one}}` : ''}`
  // without end, up (plus infinity) or down (minus infinity)
  const endless = (who, s) => `${who} ${L > 0 ? `grow${s}` : `fall${s}`} without end: the limit is ${L > 0 ? '' : 'minus '}infinity.`
  const stages = inf
    ? [
        { caption: `This is y = ${plain}.`, show: 'curve', math: `y = ${fTex}` },
        { caption: `${a > 0 ? `Make ${v} bigger and bigger` : `Make ${v} more and more negative`}: ${row(right)}.`, show: 'right', math: `\\lim_{${v} \\to ${toTex}} ${fTex}` },
        { caption: Number.isNaN(L) ? `The values don't settle on one number, so there is no limit.` : !finiteL ? endless('The values', '') : `The values get closer and closer to ${Lsaid}.`, show: 'value', math: `\\lim_{${v} \\to ${toTex}} ${fTex} ${isL} ${Ltex}` },
      ]
    : [
        { caption: `This is y = ${plain}.${defined ? '' : ` At ${v} = ${pa} it isn't defined${asymptote ? ': there is a vertical asymptote' : finiteL ? ': there is a hole' : ''}.`}`, show: 'curve', math: `y = ${fTex}` },
        ...(one !== '+' ? [{ caption: `${forced ? `It isn't defined right of ${pa}, so come closer from the left only` : `Come closer to ${pa} from the left`}: ${row(left)}.`, show: 'left', math: `${v} \\to ${pa}^-` }] : []),
        ...(one !== '-' ? [{ caption: `${forced ? `It isn't defined left of ${pa}, so come closer from the right only` : one ? 'Come closer from the right only' : 'And from the right'}: ${row(right)}.`, show: 'right', math: `${v} \\to ${pa}^+` }] : []),
        {
          caption: Number.isNaN(L)
            ? swinging
              ? `Closer and closer in, the values keep swinging up and down: they never settle, so there is no limit.`
              : one || Number.isNaN(tl) || Number.isNaN(tr)
              ? `The values don't settle on one number, so there is no limit.`
              : `Left and right go to different places, so there is no limit.`
            : !finiteL
              ? endless(one ? `${from} it` : 'Both sides', one ? 's' : '')
              : `${one ? `${from} it gets` : 'Both sides get'} closer and closer to ${Lsaid}: that's the limit.`,
          show: 'value',
          math: `\\lim_{${v} \\to ${toTex}} ${fTex} ${isL} ${Ltex}`,
        },
      ]
  const markers = [
    // a dot where f(a) is the limit, a hole where it isn't (or isn't defined)
    ...(finiteL && !inf ? [{ x: a, y: round(L, 6), kind: defined && Math.abs(fa - L) <= 1e-6 * Math.max(1, Math.abs(L)) ? 'dot' : 'hole', label: Lnum.plain, color: '#3fe0d0', when: 'value' }] : []),
    ...left.filter(([, y]) => Number.isFinite(y)).map(([x, y], i) => ({ x: round(x, 6), y: round(y, 6), kind: 'dot', color: '#ffd34d', when: 'left', delay: i * 0.35 })),
    ...right.filter(([x, y]) => Number.isFinite(y) && x >= lo && x <= hi).map(([x, y], i) => ({ x: round(x, 6), y: round(y, 6), kind: 'dot', color: '#f47a2a', when: 'right', delay: i * 0.35 })),
  ]
  // The picture is fitted to the curve. Values far outside it (1/x at 0.001 is 1000) would squash
  // the curve flat onto the x-axis: they stay in the captions, the picture keeps the curve's own
  // height (the middle 94% of it, like the plot does) and leaves those dots out.
  const ys = points.map(([, y]) => y).filter((y) => y !== null).sort((p, q) => p - q)
  let bounds = { x0: lo, x1: hi }
  let shown = markers
  if (ys.length > 20) {
    let ylo = Math.min(ys[Math.floor(ys.length * 0.03)], finiteL ? L : Infinity, 0)
    let yhi = Math.max(ys[Math.ceil(ys.length * 0.97) - 1], finiteL ? L : -Infinity, 0)
    const pad = (yhi - ylo || 1) * 0.14
    ylo -= pad
    yhi += pad
    if (markers.some((m) => m.y < ylo - (yhi - ylo) || m.y > yhi + (yhi - ylo))) {
      bounds = { ...bounds, y0: round(ylo, 6), y1: round(yhi, 6) }
      shown = markers.filter((m) => m.y >= ylo && m.y <= yhi)
    }
  }
  return {
    kind: 'limit',
    skin,
    a: inf ? null : a,
    toInfinity: inf ? Math.sign(a) : 0,
    value: finiteL ? round(L, 6) : null,
    plot: plotOf(points, { markers: shown, guide: finiteL ? { y: round(L, 6), when: 'value' } : null, bounds }),
    stages,
    resultTex: Lnum && !Lnum.exact ? `\\approx ${Ltex}` : Ltex,
  }
}

// d/dx f(x): the tangent line at a point, its slope, and the slopes everywhere (f')
function buildDerivative({ f, fTex, x0 = 1, dTex, df }, skin) {
  const h = 1e-5
  const slope = (x) => (f(x + h) - f(x - h)) / (2 * h)
  const y0 = f(x0)
  const m = slope(x0)
  if (!Number.isFinite(y0) || !Number.isFinite(m) || Math.abs(m) > 1e5) return null
  // no tangent at a corner or a cusp (|x| at 0: slope -1 on the left, 1 on the right)
  const k = 1e-6
  const r = (f(x0 + k) - y0) / k
  const l = (y0 - f(x0 - k)) / k
  if (![r, l].every((s) => Number.isFinite(s) && Math.abs(s - m) <= 1e-3 * Math.max(1, Math.abs(m)))) return null
  // the tutor's formula for f' is only shown if it matches the slopes
  let formula = null
  if (df) {
    const ok = [-2, -0.7, 0.5, 1.3, 2.4, x0].every((x) => {
      const want = slope(x)
      const got = df(x)
      return !Number.isFinite(want) || (Number.isFinite(got) && Math.abs(got - want) <= 1e-3 * Math.max(1, Math.abs(want)))
    })
    if (ok) formula = dTex
  }
  // zoom on the point, so a slope of 3 looks like 3 (the curve may leave the picture)
  const w = 1.6
  const lo = x0 - w
  const hi = x0 + w
  const span = Math.max(1.6, Math.abs(m) * w * 1.15)
  const points = samples(f, lo - 0.5, hi + 0.5, 220)
  const dpoints = samples(slope, lo - 0.5, hi + 0.5, 160)
  const slope0 = niceNum(m) // 3, 1/4, or about 2.718 (e^x at 1)
  const stages = [
    { caption: `This is y = ${texToPlain(fTex)}.`, show: 'curve', math: `y = ${fTex}` },
    { caption: `The derivative is the slope of the curve: how steep it is at each point.`, show: 'tangent', math: `f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}` },
    { caption: `At x = ${fmt(x0)} the tangent line has slope ${slope0.exact ? slope0.plain : `about ${slope0.plain}`}.`, show: 'tangent', math: niceEq(`f'(${fmt(x0)})`, m) },
    { caption: formula ? `Doing this everywhere gives a new curve: f'(x) = ${texToPlain(formula)}.` : `Doing this everywhere gives a new curve, the derivative.`, show: 'derivative', math: formula ? `f'(x) = ${formula}` : `f'(x)` },
  ]
  return {
    kind: 'derivative',
    skin,
    x0,
    y0: round(y0, 6),
    slope: round(m, 6),
    formula,
    plot: plotOf(points, {
      extra: [{ points: dpoints, color: '#f47a2a', dash: true, label: "f'(x)", when: 'derivative' }],
      markers: [{ x: x0, y: round(y0, 6), kind: 'dot', label: `(${fmt(x0)}, ${fmt(round(y0, 3))})`, color: '#ffd34d', when: 'tangent' }],
      tangent: { x0, y0: round(y0, 6), m: round(m, 6), when: 'tangent' },
      bounds: { x0: lo, x1: hi, y0: round(y0 - span, 6), y1: round(y0 + span, 6) },
    }),
    stages,
    resultTex: niceEq(`f'(${fmt(x0)})`, m),
  }
}

// Two straight lines: the solution is where they cross
function buildSystem({ e1, e2 }, skin) {
  const det = e1.a * e2.b - e2.a * e1.b
  if (Math.abs(det) < 1e-12 || Math.abs(e1.b) < 1e-12 || Math.abs(e2.b) < 1e-12) return null
  const x = (e1.c * e2.b - e2.c * e1.b) / det
  const y = (e1.a * e2.c - e2.a * e1.c) / det
  if (![x, y].every((v) => Number.isFinite(v) && Math.abs(v) < 1e4)) return null
  const line = (e) => (t) => (e.c - e.a * t) / e.b
  const lo = x - 5
  const hi = x + 5
  const eqTex = (e) => `${fmt(e.a) === '1' ? '' : fmt(e.a) === '-1' ? '-' : fmt(e.a)}x ${e.b < 0 ? '-' : '+'} ${fmt(Math.abs(e.b)) === '1' ? '' : fmt(Math.abs(e.b))}y = ${fmt(e.c)}`
  // the answer exactly: with whole-number coefficients x and y are fractions (Cramer's rule:
  // x + 2y = 1, 3x - 7y = 2 has x = 11/13), else as exact as they can be, ≈ when rounded
  const whole = [e1.a, e1.b, e1.c, e2.a, e2.b, e2.c].every((v) => isInt(v) && Math.abs(v) < 1e6)
  const D = Math.round(det)
  const exactly = (top) => {
    const g = gcd(top, D) || 1
    const [n, d] = D < 0 ? [-top / g, -D / g] : [top / g, D / g]
    return { tex: fracTex(n, d), plain: d === 1 ? String(n) : `${n}/${d}`, exact: true }
  }
  const X = whole ? exactly(Math.round(e1.c * e2.b - e2.c * e1.b)) : niceNum(x)
  const Y = whole ? exactly(Math.round(e1.a * e2.c - e2.a * e1.c)) : niceNum(y)
  const answer = `x ${X.exact ? '=' : '\\approx'} ${X.tex},\\ y ${Y.exact ? '=' : '\\approx'} ${Y.tex}`
  const stages = [
    { caption: `The first equation is a straight line.`, show: 'line1', math: eqTex(e1) },
    { caption: `So is the second one.`, show: 'line2', math: eqTex(e2) },
    { caption: `The solution is the point on both lines: where they cross, ${X.exact && Y.exact ? '' : 'about '}(${X.plain}, ${Y.plain}).`, show: 'cross', math: answer },
  ]
  return {
    kind: 'system',
    skin,
    x: round(x, 6),
    y: round(y, 6),
    plot: plotOf(samples(line(e1), lo, hi, 80), {
      mainWhen: 'line1',
      extra: [{ points: samples(line(e2), lo, hi, 80), color: '#f47a2a', label: '', when: 'line2' }],
      markers: [{ x: round(x, 6), y: round(y, 6), kind: 'dot', label: `(${X.plain}, ${Y.plain})`, color: '#ffd34d', when: 'cross' }],
      bounds: { x0: lo, x1: hi },
    }),
    stages,
    resultTex: answer,
  }
}

// ax + by = c from "2x + y = 5"
function linear2(eq) {
  const sides = toExpr(eq).split('=')
  if (sides.length !== 2) return null
  try {
    const L = compile(sides[0], ['x', 'y'])
    const R = compile(sides[1], ['x', 'y'])
    const g = (x, y) => L(x, y) - R(x, y)
    const c0 = g(0, 0)
    const a = g(1, 0) - c0
    const b = g(0, 1) - c0
    if (Math.abs(g(2, 3) - (2 * a + 3 * b + c0)) > 1e-9 || Math.abs(g(-1, 5) - (-a + 5 * b + c0)) > 1e-9) return null
    return { a, b, c: -c0 }
  } catch {
    return null
  }
}

// coefficients of a polynomial of degree <= 2 in x, or null
function quad(g) {
  const c = g(0)
  const p1 = g(1)
  const m1 = g(-1)
  const a = (p1 + m1) / 2 - c
  const b = (p1 - m1) / 2
  const fits = [2, 3, -2, 0.5].every((x) => Math.abs(g(x) - (a * x * x + b * x + c)) < 1e-7 * Math.max(1, Math.abs(g(x))))
  // without the rounding noise of the evaluation: (x - 1/3)^2 has b = -2/3 and c = 1/9 exactly
  return fits && [a, b, c].every(Number.isFinite) ? { a: snapNum(a), b: snapNum(b), c: snapNum(c) } : null
}

// ------------------------------------------------------------------ probability

// Chance: every outcome is drawn; the favourable ones light up; P = favourable / all.
//   die: one die: a face, even, odd, more/less than k, at least/at most k, not a face, one of some faces;
//   dice: two dice, the sum (= k, or more/less than k, at least/at most k);
//   coins: n coins, k heads (or tails; exactly, at least, at most...) or one order (HT);
//   bag: r red and b blue, P(red) or P(blue)
const CMP = { '=': (a, b) => a === b, '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b }
function buildChance(c, skin) {
  let outcomes
  let what
  if (c.type === 'die') {
    outcomes = [1, 2, 3, 4, 5, 6].map((v) => ({ label: String(v) }))
    const faces = Array.isArray(c.faces) && c.faces.length >= 2 && c.faces.every((f) => isInt(f)) ? c.faces : null
    const test = { face: (v) => v === c.face, even: (v) => v % 2 === 0, odd: (v) => v % 2 === 1, more: (v) => v > c.k, less: (v) => v < c.k, atleast: (v) => v >= c.k, atmost: (v) => v <= c.k, not: (v) => v !== c.face, faces: faces && ((v) => faces.includes(v)) }[c.event]
    if (!test) return null
    outcomes.forEach((o, i) => (o.good = test(i + 1)))
    what = { face: `a ${c.face}`, even: 'an even number', odd: 'an odd number', more: `more than ${c.k}`, less: `less than ${c.k}`, atleast: `${c.k} or more`, atmost: `${c.k} or less`, not: `anything but a ${c.face}`, faces: faces && faces.map((f) => `a ${f}`).join(' or ') }[c.event]
  } else if (c.type === 'dice') {
    const cmp = c.cmp ?? '='
    if (!CMP[cmp] || !isInt(c.sum) || !(c.sum >= 2 && c.sum <= 12)) return null
    outcomes = []
    for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) outcomes.push({ label: `${i}+${j}`, good: CMP[cmp](i + j, c.sum) })
    what = `${{ '=': 'a sum of ', '>': 'a sum of more than ', '<': 'a sum of less than ', '>=': 'a sum of ', '<=': 'a sum of ' }[cmp]}${c.sum}${{ '>=': ' or more', '<=': ' or less' }[cmp] ?? ''} with two dice`
  } else if (c.type === 'coins') {
    const cmp = c.cmp ?? '='
    const side = c.side === 'T' ? 'T' : 'H'
    const seq = typeof c.seq === 'string' ? c.seq : null
    if (!(c.n >= 1 && c.n <= 4) || (seq ? !new RegExp(`^[HT]{${c.n}}$`).test(seq) : !(CMP[cmp] && isInt(c.k) && c.k >= 0 && c.k <= c.n))) return null
    outcomes = []
    for (let m = 0; m < 2 ** c.n; m++) {
      const flips = Array.from({ length: c.n }, (_, i) => ((m >> (c.n - 1 - i)) & 1 ? 'T' : 'H'))
      const label = flips.join('')
      outcomes.push({ label, good: seq ? label === seq : CMP[cmp](flips.filter((f) => f === side).length, c.k) })
    }
    const coins = `${c.n} coin${c.n === 1 ? '' : 's'}`
    what = seq
      ? `${seq.split('').map((f) => (f === 'H' ? 'heads' : 'tails')).join(', then ')} with ${coins}`
      : `${{ '=': '', '>': 'more than ', '<': 'fewer than ', '>=': 'at least ', '<=': 'at most ' }[cmp]}${c.k} ${side === 'H' ? 'head' : 'tail'}${c.k === 1 ? '' : 's'} with ${coins}`
  } else if (c.type === 'bag') {
    if (!(isInt(c.red) && isInt(c.blue) && c.red >= 0 && c.blue >= 0 && c.red + c.blue >= 1 && c.red + c.blue <= 40) || !['red', 'blue'].includes(c.want)) return null
    outcomes = [...Array(c.red).fill({ label: 'red', good: c.want === 'red' }), ...Array(c.blue).fill({ label: 'blue', good: c.want === 'blue' })].map((o) => ({ ...o }))
    what = `a ${c.want} ball`
  } else return null
  const good = outcomes.filter((o) => o.good).length
  const all = outcomes.length
  const stages = [
    { caption: `All the things that can happen: ${all} outcomes, all equally likely.`, show: 'all' },
    { caption: `The ones that give ${what}: ${good}.`, show: 'good' },
    { caption: `Probability = ${good} out of ${all}${good && fracTex(good, all) !== `\\frac{${good}}{${all}}` ? `, which is ${texToPlain(fracTex(good, all))}` : ''}.`, show: 'value', math: `P = \\frac{${good}}{${all}}${fracTex(good, all) !== `\\frac{${good}}{${all}}` ? ` = ${fracTex(good, all)}` : ''}${good === 0 || good === all ? '' : exactDec(good / all) !== null ? ` = ${exactDec(good / all)}` : ` \\approx ${fmt(round(good / all, 3))}`}` },
  ]
  return { kind: 'chance', skin, type: c.type, outcomes, good, all, stages, resultTex: fracTex(good, all) }
}

// Combinations: choose r out of n (all the groups drawn when there are few), the formula;
// or n! ways to put n things in a row
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1))
function buildCombinations({ n, r }, skin) {
  if (!isInt(n) || n < 1 || n > 20) return null
  const letters = 'ABCDEFGHIJKLMNOPQRST'.slice(0, n).split('')
  if (r === null || r === undefined) {
    const value = fact(n)
    const stages =
      n === 1
        ? [
            { caption: `1 thing on its own: how many orders?`, show: 'items' },
            { caption: `There is just 1 place, and 1 choice for it.`, show: 'slots', math: `1! = 1` },
            { caption: `That makes 1 order.`, show: 'value', math: `1! = 1` },
          ]
        : [
            { caption: `${n} things in a row: how many orders?`, show: 'items' },
            { caption: n === 2 ? `2 choices for the first place, then 1 for the last.` : `${n} choices for the first place, ${n - 1} for the next, and so on.`, show: 'slots', math: `${n}! = ${Array.from({ length: Math.min(n, 8) }, (_, i) => n - i).join(' \\times ')}${n > 8 ? ' \\times \\cdots' : ''}` },
            { caption: `That makes ${value} orders.`, show: 'value', math: `${n}! = ${value}` },
          ]
    return { kind: 'combinations', skin, n, r: null, letters, value, groups: [], stages, resultTex: String(value) }
  }
  if (!isInt(r) || r < 0 || r > n) return null
  const value = fact(n) / (fact(r) * fact(n - r))
  const groups = []
  const pick = (start, acc) => {
    if (groups.length > 30) return
    if (acc.length === r) return void groups.push(acc.join(''))
    for (let i = start; i < n; i++) pick(i + 1, [...acc, letters[i]])
  }
  // choosing none: one way, the empty group (nothing to draw)
  if (value <= 30 && r > 0) pick(0, [])
  const stages = [
    { caption: `Choose ${r} out of ${n}. The order doesn't matter.`, show: 'items', math: `\\binom{${n}}{${r}}` },
    ...(r === 0 ? [{ caption: `There is just one way to choose nothing: take none of them.`, show: 'items' }] : []),
    ...(groups.length ? [{ caption: `Here are all the groups: ${groups.slice(0, 10).join(', ')}${groups.length > 10 ? ', and more' : ''}.`, show: 'groups' }] : []),
    { caption: `The formula: n! ÷ (r! × (n − r)!) = ${n}! ÷ (${r}! × ${n - r}!) = ${value}.`, show: 'value', math: `\\binom{${n}}{${r}} = \\frac{${n}!}{${r}!\\,${n - r}!} = ${value}` },
  ]
  return { kind: 'combinations', skin, n, r, letters, value, groups, stages, resultTex: String(value) }
}

// Tree diagram for two independent events: multiply along the branches
// A probability as an exact ratio [n, d]: as written (fraction: [1, 3]), else from its decimals
// (0.25 -> [25, 100]) or a small fraction; null if it has none.
function ratioOf(v, written) {
  if (Array.isArray(written) && written.every((x) => isInt(x)) && written[1] > 0 && Math.abs(written[0] / written[1] - v) < 1e-12) return written
  for (let k = 0; k <= 6; k++) if (isInt(v * 10 ** k) && Math.abs(Math.round(v * 10 ** k) / 10 ** k - v) < 1e-12) return [Math.round(v * 10 ** k), 10 ** k]
  return smallFraction(v)
}
function buildTree({ pA, pB, nameA = 'A', nameB = 'B', fracA, fracB }, skin) {
  if (![pA, pB].every((p) => Number.isFinite(p) && p >= 0 && p <= 1)) return null
  const A = ratioOf(pA, fracA)
  const B = ratioOf(pB, fracB)
  if (!A || !B) return null
  const both = pA * pB
  // exact all the way: fractions stay fractions (1/3, not 0.333), decimals are written in full
  // (0.25 × 0.35 = 0.0875); never rounded and shown with "="
  const asFrac = Array.isArray(fracA) || Array.isArray(fracB)
  const red = (n, d) => {
    const g = gcd(n, d) || 1
    return [n / g, d / g]
  }
  const dec = (n, d) => exactDec(n / d)
  const plain = (n, d, frac = asFrac) => {
    ;[n, d] = red(n, d)
    return frac || dec(n, d) === null ? (d === 1 ? String(n) : `${n}/${d}`) : dec(n, d)
  }
  const tex = (n, d, frac = asFrac) => (frac || dec(n, d) === null ? fracTex(n, d) : dec(n, d))
  const [nA, dA] = A
  const [nB, dB] = B
  const [n, d] = red(nA * nB, dA * dB)
  // the answer: a decimal when it ends (1/4 × 2/5 = 0.1; two decimals always do), else the
  // fraction (1/4 × 1/3 = 1/12)
  const decimals = !asFrac && [dA, dB].every((x) => /^10*$/.test(String(x)))
  const ansDec = dec(n, d) ?? (decimals ? String(+both.toFixed(12)) : null)
  const ansTex = ansDec ?? fracTex(n, d)
  const ansPlain = ansDec ?? `${n}/${d}`
  const product = asFrac && ansDec !== null && d !== 1 ? `${fracTex(n, d)} = ${ansTex}` : ansTex
  const stages = [
    { caption: `First ${nameA}: it happens with probability ${plain(nA, dA)}, or not with ${plain(dA - nA, dA)}.`, show: 'first' },
    { caption: `Then ${nameB}: ${plain(nB, dB)}, or not ${plain(dB - nB, dB)}, on every branch.`, show: 'second' },
    { caption: `Both happen: follow the top branch and multiply, ${plain(nA, dA)} × ${plain(nB, dB)} = ${asFrac && ansDec !== null && d !== 1 ? `${n}/${d} = ` : ''}${ansPlain}.`, show: 'path', math: `P(${nameA} \\cap ${nameB}) = ${tex(nA, dA)} \\times ${tex(nB, dB)} = ${product}` },
  ]
  // the branch and path labels, as exact as the captions (for the picture)
  const labels = {
    A: plain(nA, dA),
    notA: plain(dA - nA, dA),
    B: plain(nB, dB),
    notB: plain(dB - nB, dB),
    paths: [[nA, nB], [nA, dB - nB], [dA - nA, nB], [dA - nA, dB - nB]].map(([x, y]) => plain(x * y, dA * dB)),
  }
  return { kind: 'tree', skin, pA, pB, nameA, nameB, both: round(both, 6), labels, stages, resultTex: ansTex }
}

// ------------------------------------------------------------------ reading an exercise

// \int_a^b f(x) dx -> { lo, hi, body, variable }, or null. A bound is a {group} (nested braces
// too: \int_0^{\frac{\pi}{2}}), a number, a letter or a command (\pi). Read with a scanner, not
// one big regex (that one backtracked for minutes on long runs of spaces).
function readIntegral(src) {
  const m = /\\int(?:\\limits)?\s*_\s*/.exec(src)
  if (!m) return null
  const bound = (i) => {
    while (src[i] === ' ') i++
    if (src[i] === '{') return texArg(src, i)
    const t = /^(?:-?\d+(?:\.\d+)?|-?\\[a-zA-Z]+|-?[a-zA-Z])/.exec(src.slice(i, i + 40))
    return t ? { body: t[0], end: i + t[0].length } : null
  }
  const lo = bound(m.index + m[0].length)
  if (!lo) return null
  let i = lo.end
  while (src[i] === ' ') i++
  if (src[i] !== '^') return null
  const hi = bound(i + 1)
  if (!hi) return null
  // the body: at least one character, up to the first "dx" (spacing like \, before it is not part of it)
  const rest = src.slice(hi.end).replace(/^\s+/, '')
  const d = /(?:\s|\\[,;:!])*d\s*([a-z])\b/g
  d.lastIndex = 1
  const dm = d.exec(rest)
  if (!dm) return null
  // only an answer may follow (= ..., ≈ ...), and only words may come before ("Compute ...")
  const after = rest.slice(dm.index + dm[0].length).trim()
  if (after && !/^(?:=|\\approx|≈|[.,;:?!])/.test(after)) return null
  if (/[\d)}+\-*/=^]\s*$/.test(src.slice(0, m.index))) return null
  return { lo: lo.body, hi: hi.body, body: rest.slice(0, dm.index).trim(), variable: dm[1] }
}
const num = (s) => {
  try {
    const v = compile(String(s), [])() // a number: no variable in it (braces are brackets to the parser)
    return Number.isFinite(v) ? v : NaN
  } catch {
    return NaN
  }
}

/** Rules: the scene for an exercise written on paper (LaTeX or plain), or null. */
const NUMWORD = { no: 0, zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
const numOrWord = (t) => (/^\d+$/.test(t) ? Number(t) : NUMWORD[t])

// detectSpecial's answer for "this is a question of chance it can't read": no scene at all
const STOP = Object.freeze({ kind: null, stop: true })

// A rule fires only on the whole exercise: around what it matched there may be words ("What is",
// "Find the") before, and nothing, "?", "." or the answer written down ("= 10") after. So
// 20% of 50 + 10, 2 × log_2 8 or \binom{5}{2} \times 2 are not a percentage, a log or a binomial.
function alone(src, m) {
  const before = src.slice(0, m.index)
  const after = src.slice(m.index + m[0].length)
  return /^[\p{L}\s,:;.'’!?]*$/u.test(before) && /^\s*(?:=.*|[?.!]*)\s*$/s.test(after)
}

// ---- probability, read from words. Each reader returns null when it can't read the whole
// question: no animation is better than the probability of another event.

// a question about chance
const PCUE = /probabilit|chances?\b|likel(?:y|ihood)|\bp\s*\(|\bodds\b|random/
// what is asked: what P( ) holds, or the rest of the sentence after "probability"/"chance"
function askedPart(low) {
  const ps = [...low.matchAll(/\bp\s*\(([^()]*)\)/g)]
  if (ps.length > 1) return null // two questions
  if (ps.length) return ps[0][1]
  const q = /(?:probabilit(?:y|ies)|chances?|likelihood|odds|likely)\b([^.?!]*)/.exec(low)
  return q ? q[1] : null
}
// a comparison with a number: "more than 4", "at least 10", "5 or more", "≥ 10", "x > 4"
const CMPWORDS = [
  ['>=', /^(?:greater|more|bigger|higher) than or equal to$|^at least$|^no (?:less|fewer|smaller) than$|^not (?:less|fewer) than$|^>=$|^≥$|^\\geq?$/],
  ['<=', /^(?:less|smaller|lower|fewer) than or equal to$|^at most$|^no (?:more|greater|bigger) than$|^not more than$|^<=$|^≤$|^\\leq?$/],
  ['>', /^(?:greater|more|bigger|higher) than$|^over$|^above$|^>$|^\\gt$/],
  ['<', /^(?:less|smaller|lower|fewer) than$|^under$|^below$|^<$|^\\lt$/],
  ['=', /^=$|^==$|^equal to$|^equals?$|^exactly$/],
]
const CMP_RE = /^(?:(greater than or equal to|more than or equal to|less than or equal to|smaller than or equal to|(?:greater|more|bigger|higher|less|smaller|lower|fewer) than|at least|at most|no (?:less|fewer|smaller|more|greater|bigger) than|not (?:less|fewer|more) than|over|above|under|below|equal to|equals?|exactly|>=|<=|==|≥|≤|\\[gl]eq?|\\[gl]t|[<>=])\s*)?(\d+)(?:\s+(or (?:more|higher|greater|above|over|bigger|less|lower|fewer|smaller|below|under)))?$/
function readCmp(t) {
  const m = CMP_RE.exec(t.trim())
  if (!m) return null
  const k = Number(m[2])
  if (m[1] && m[3]) return null
  if (m[3]) return { cmp: /more|higher|greater|above|over|bigger/.test(m[3]) ? '>=' : '<=', k }
  if (!m[1]) return { cmp: '=', k }
  const c = CMPWORDS.find(([, re]) => re.test(m[1]))
  return c ? { cmp: c[0], k } : null
}

// Dice: one ordinary die (a face, even, odd, more/less than, at least/at most, not, a 3 or a 4)
// or two dice (the sum, maybe compared). Three dice, other dice, a die rolled again: null.
function readDice(low) {
  const sided = /\b(\w+)[-\s]sided\b/.exec(low)
  if ((sided && !['6', 'six'].includes(sided[1])) || /hedral|\bd(?:4|8|10|12|20)\b|spinner/.test(low)) return null
  const t = low.replace(/\b(?:6|six)[-\s]sided\b|\b(?:fair|normal|ordinary|standard|unbiased|regular)\b/g, ' ').replace(/\s+/g, ' ')
  const two = /\b(?:two|2|both|pair of) dice\b/.test(t)
  const one = /\b(?:a|an|one|the|this|that|your|1) (?:die|dice)\b/.test(t) && !/\bthe dice\b/.test(t)
  if (/\b(?:three|four|five|six|[3-9]|\d\d+) dice\b|\b(?:twice|thrice|again|times)\b/.test(t)) return null
  if (two && !/\bthe die\b|\b(?:a|one) die\b/.test(t)) {
    // the sum of the two dice: "= 7", "more than 9", "7 or more"... and nothing else asked
    const s = /\b(?:sum|total)\b([^.?!;]*)/.exec(t)
    if (!s) {
      // no "sum": "the probability of getting 7 when 2 dice are rolled / launched" is the sum too
      const g = /\b(?:getting|get|gets|obtain(?:ing)?|scor(?:e|es|ing)|making|make|rolling|roll|throwing)\s+(?:an?\s+|exactly\s+)?(\d{1,2})\b(?!\s*(?:dice|die|times|sixes))/.exec(t)
      const k = g ? Number(g[1]) : NaN
      return k >= 2 && k <= 12 ? { type: 'dice', sum: k, cmp: '=' } : null
    }
    const rest = s[1]
      .replace(/[()]/g, ' ')
      .replace(/\b(?:when|if|after)\b.*$/, ' ')
      .replace(/\b(?:of|on|from|with|for|using|shown by|given by)\s+(?:the\s+)?(?:(?:two|2|both)\s+)?(?:dice|die|scores?|numbers?|faces?)\b/g, ' ')
      .replace(/\b(?:scores?|numbers?|shown|showing|rolled|thrown|obtained|is|will be|being|be|of|a|the|that)\b/g, ' ')
      .replace(/\s+/g, ' ')
    const c = readCmp(rest)
    return c ? { type: 'dice', sum: c.k, cmp: c.cmp } : null
  }
  if (!one || two) return null
  let q = askedPart(t)
  if (q === null) return null
  q = q
    .replace(/\b(?:on|with|from|using|when rolling|when you roll|if you roll)\s+(?:a|an|one|the) (?:dice|die)\b|\b(?:a|an|one|the) (?:dice|die)\b/g, ' ')
    .replace(/\b(?:a|an)\s+(one|two|three|four|five|six)\b/g, (_, w) => String(NUMWORD[w]))
    .replace(/\b(?:rolling|roll|rolls|rolled|getting|get|gets|throwing|throw|throws|thrown|scoring|score|scores|landing on|lands on|land on|showing|shows|show|obtaining|obtain|it|is|be|will|you|that|the|number|a|an|of|on|top|face|side|up|exactly)\b/g, ' ')
    .replace(/^\s*x\s*(?=[<>=≤≥\\])/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  let m
  if ((m = /^(not )?(even|odd)$/.exec(q))) return { type: 'die', event: (m[2] === 'even') === !m[1] ? 'even' : 'odd' }
  if ((m = /^not (\d+)$/.exec(q))) return { type: 'die', event: 'not', face: Number(m[1]) }
  if (/^\d+(?:\s*(?:,|or)\s*\d+)*\s*or\s*\d+$/.test(q)) {
    const faces = [...new Set(q.match(/\d+/g).map(Number))]
    return faces.length >= 2 ? { type: 'die', event: 'faces', faces } : null
  }
  const c = readCmp(q)
  if (!c) return null
  return c.cmp === '=' ? { type: 'die', event: 'face', face: c.k } : { type: 'die', event: { '>': 'more', '<': 'less', '>=': 'atleast', '<=': 'atmost' }[c.cmp], k: c.k }
}

// Coins: n coins (or one coin tossed n times), and how many heads or tails (exactly, at least,
// at most...) or one order (P(HT)). Coins in a money problem are no question of chance.
function readCoins(low) {
  const t = low.replace(/\b(?:fair|unbiased|ordinary|normal|identical|different)\s+/g, '')
  const counts = [...t.matchAll(/\b(\d+|a|an|one|two|three|four|five|six)\s+coins?\b/g)].map((m) => numOrWord(m[1]))
  const times = /\b(?:(\d+|two|three|four|five|six)\s+times|(twice)|(thrice))\b/.exec(t)
  if (new Set(counts).size !== 1) return null
  let n = counts[0]
  if (times) {
    if (n !== 1) return null
    n = times[2] ? 2 : times[3] ? 3 : numOrWord(times[1])
  }
  let q = askedPart(t)
  if (q === null || /\b(?:or|not|first|second|third|then|row|followed|before|after|until|consecutive)\b/.test(q)) return null
  q = q.replace(/\bcoins?\b/g, ' ')
  const seq = /^\s*([ht]{1,4})\s*$/.exec(q) || /\b(?:getting|get|of)\s+([ht]{2,4})\b/.exec(q)
  if (seq) return seq[1].length === n ? { type: 'coins', n, seq: seq[1].toUpperCase() } : null
  const said = [...q.matchAll(/(?:\b(exactly|at least|at most|no more than|no fewer than|no less than|not more than|more than|fewer than|less than)\s+)?\b(?:(\d+|no|zero|one|two|three|four|a|an|all|both)\s+)?(heads?|tails?)\b/g)]
  if (!said.length || said.length > 2) return null
  const read = said.map((m) => {
    const side = m[3].startsWith('h') ? 'H' : 'T'
    // "a head" with two coins: exactly one, or at least one? Only clear next to "and a tail"
    const k = m[2] === 'all' || m[2] === 'both' ? n : (m[2] === 'a' || m[2] === 'an') && n > 1 && said.length === 1 ? undefined : m[2] ? numOrWord(m[2]) : n === 1 ? 1 : undefined
    const cmp = m[1] ? CMPWORDS.find(([, re]) => re.test(m[1]))?.[0] : '='
    return { side, k, cmp }
  })
  if (read.some((r) => r.k === undefined || !r.cmp)) return null
  if (read.length === 2) {
    // a head and a tail: the counts make all the coins
    const [h, tl] = read[0].side === 'H' ? read : [read[1], read[0]]
    if (h.side !== 'H' || tl.side !== 'T' || h.cmp !== '=' || tl.cmp !== '=' || h.k + tl.k !== n) return null
    return { type: 'coins', n, k: h.k, cmp: '=', side: 'H' }
  }
  return { type: 'coins', n, k: read[0].k, cmp: read[0].cmp, side: read[0].side }
}

// A bag of red and blue: one taken out, P(red) or P(blue) (or not red...). Other colours, more
// draws, or no colour asked: null. "3 red cars and 5 blue cars, how many?" is no question of chance.
const COLOURS = 'red|blue|green|yellow|white|black|orange|purple|pink|brown|grey|gray|silver|gold'
function readBag(low) {
  const counts = [...low.matchAll(new RegExp(`(?<![\\d.])(\\d+)\\s+(${COLOURS})\\b`, 'g'))]
  const n = {}
  for (const [, k, colour] of counts) {
    if (n[colour] !== undefined && n[colour] !== Number(k)) return null
    n[colour] = Number(k)
  }
  if (Object.keys(n).some((c) => c !== 'red' && c !== 'blue') || n.red === undefined || n.blue === undefined) return null
  const rest = low.replace(new RegExp(`(?<![\\d.])(\\d+)\\s+(${COLOURS})\\b`, 'g'), ' ')
  if (/\d|\b(?:two|three|both|twice|again|second|another|replace\w*|in a row|one after|then|each)\b/.test(rest)) return null
  const q = askedPart(rest)
  if (q === null) return null
  // "not red", "not a red", "not picking (out) red", "isn't red", "non-red"
  const NOT = String.raw`(?:\bnot|n't|\bnon-?)\s*(?:(?:picking|getting|taking|drawing|choosing|pulling|being|selecting)\s+(?:out\s+)?)?(?:a\s+|an\s+|the\s+|one\s+)?`
  const said = new Set([...q.matchAll(new RegExp(`(${NOT})?\\b(${COLOURS})\\b`, 'g'))].map((m) => `${m[1] ? 'not ' : ''}${m[2]}`))
  if (said.size !== 1) return null
  const [w] = said
  const colour = w.replace('not ', '')
  if (colour !== 'red' && colour !== 'blue') return null
  const want = w.startsWith('not ') ? (colour === 'red' ? 'blue' : 'red') : colour
  return { type: 'bag', red: n.red, blue: n.blue, want }
}

// Two independent events: P(A) = 0.3, P(B) = 1/4 given, P(A and B) / P(A ∩ B) / "both" asked,
// of exactly those two. A union, a conditional, a given intersection, events said to be
// dependent or mutually exclusive: null.
const PVAL = String.raw`(\d*\.\d+|\d+\s*\/\s*\d+|\\[dt]?frac\s*\{\s*\d+\s*\}\s*\{\s*\d+\s*\}|[01](?![\d.]))`
function readTree(src) {
  const given = [...src.matchAll(new RegExp(String.raw`\b[pP]\s*\(\s*([A-Za-z])\s*\)\s*=\s*${PVAL}`, 'g'))]
  if (given.length < 2) return undefined
  const low = src.toLowerCase()
  const value = {}
  for (const [, l, v] of given) {
    const L = l.toUpperCase()
    const f = /^(\d+)\s*\/\s*(\d+)$/.exec(v) || /\{\s*(\d+)\s*\}\s*\{\s*(\d+)\s*\}/.exec(v)
    const p = f ? { p: Number(f[1]) / Number(f[2]), frac: [Number(f[1]), Number(f[2])] } : { p: Number(v) }
    if (value[L] && value[L].p !== p.p) return null
    value[L] = p
  }
  const JOIN = String.raw`\\cap|∩|\\cup|∪|\\mid|\||\band\b|\bor\b|&|,|\\text\s*\{\s*(?:and|or)\s*\}`
  const pairs = [...low.matchAll(new RegExp(String.raw`\bp\s*\(\s*([a-z])\s*(${JOIN})\s*([a-z])\s*\)(\s*=\s*\d)?`, 'g'))]
  if (/\bp\s*\(\s*[a-z]\s*(?:'|\^|\\prime|\\overline|\\bar)|\bp\s*\(\s*(?:not|\\neg)/.test(low)) return null // complements
  if (pairs.some((m) => m[4])) return null // P(A ∩ B) is given: the question is another one
  if (pairs.some((m) => !/\\cap|∩|and|&|,/.test(m[2]))) return null // a union or a conditional
  let names = [...new Set(pairs.map((m) => `${m[1]}${m[3]}`.toUpperCase()))]
  if (names.length > 1) return null
  if (!names.length) {
    if (!/\bboth\b/.test(low) || given.length !== 2 || /\bor\b|\\cup|∪/.test(low)) return null
    names = [Object.keys(value).join('')]
  }
  const [A, B] = names[0].split('')
  if (A === B || !value[A] || !value[B]) return null
  // multiplying needs independent events: not when the text says otherwise
  if (/\bnot\s+independent|mutually exclusive|\bdisjoint\b|\bdependent\b/.test(low)) return null
  const said = /\b([a-z])\s+and\s+([a-z])\s+(?:are\s+)?independent/.exec(low)
  if (said && `${said[1]}${said[2]}`.toUpperCase() !== `${A}${B}` && `${said[2]}${said[1]}`.toUpperCase() !== `${A}${B}`) return null
  return { kind: 'tree', pA: value[A].p, pB: value[B].p, nameA: A, nameB: B, fracA: value[A].frac, fracB: value[B].frac }
}
const REL = { '<': '<', '\\lt': '<', '>': '>', '\\gt': '>', '<=': '<=', '≤': '<=', '\\le': '<=', '\\leq': '<=', '\\leqslant': '<=', '>=': '>=', '≥': '>=', '\\ge': '>=', '\\geq': '>=', '\\geqslant': '>=' }

// The kinds read from words and special notation (probability, limits, trig...), or null.
function detectSpecial(src) {
  const low = src.toLowerCase()
  // limits: \lim_{x \to 2} ..., \lim\limits_{x \to 0^{+}} ..., \lim_{x \to \frac{\pi}{2}} ..., lim x->2 ..., lim x->0+ ...
  const ls = src.replace(/\\(?:limits|nolimits)(?![a-zA-Z])/g, '').replace(/\^\s*\{\s*([+-])\s*\}/g, '^$1')
  let lim = null
  const lt = /\\lim\s*_\s*/.exec(ls)
  const sub = lt && texArg(ls, lt.index + lt[0].length)
  const parts = sub && /^\s*([a-z])\s*(?:\\to|\\rightarrow|->|→)\s*(.+?)\s*$/.exec(sub.body)
  if (parts) lim = [null, parts[1], parts[2], ls.slice(sub.end)]
  else lim = /\blim\s*\(?\s*([a-z])\s*(?:->|→|\\to)\s*([-+]?[\w.\\]+(?:\^?[+-](?=[\s)]|$))?)\s*\)?\s*(.+)$/.exec(ls)
  if (lim) {
    let to = lim[2].replace(/\s+/g, '')
    let side = null
    const sd = /^(.*?[^+\-^])\^?([+-])$/.exec(to)
    if (sd) [, to, side] = sd
    const sign = to.startsWith('-') ? -1 : 1
    // infinity in any spelling; a decimal comma (0,5); anything else must be a number (x -> c is not)
    const a = /^(?:\\infty|∞|infty|inf|infinity|infinite|oo)$/i.test(to.replace(/^[+-]/, '')) ? sign * Infinity : num(to.replace(/^(-?\d+),(\d+)$/, '$1.$2'))
    return { kind: 'limit', variable: lim[1], to: a, side: Number.isFinite(a) ? side : null, expression: lim[3].replace(/=\s*[^=]*$/, '').trim() }
  }
  // derivatives: \frac{d}{dx} ..., d/dx ..., f'(2) with f(x) = ...
  const dd = /\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*([a-z])\s*\}\s*(.+)$/.exec(src) || /\bd\s*\/\s*d([a-z])\s*(.+)$/.exec(src)
  if (dd) return { kind: 'derivative', variable: dd[1], expression: dd[2].replace(/=.*$/, '').trim().replace(/^\\left\(|\\right\)$/g, '').replace(/^\((.*)\)$/, '$1') }
  const fp = /f\s*'\s*\(\s*(-?[\d.]+)\s*\)/.exec(src)
  const fdef = /f\s*\(\s*x\s*\)\s*=\s*([^,;]+)/.exec(src)
  if (fp && fdef) return { kind: 'derivative', variable: 'x', expression: fdef[1].trim(), at: Number(fp[1]) }
  // probability: combinations, factorials, two independent events, dice, coins, a bag.
  // \binom{n}{r}, nCr: the whole exercise (\binom{5}{2} \times 2 is not 10); C(n, r) also needs
  // nothing but itself or a word about choosing (C(4, 3) next to A(0, 0) is a point)
  const bin = /\\[dt]?binom\s*\{\s*(\d+)\s*\}\s*\{\s*(\d+)\s*\}/.exec(src) || /(?<![\w.])(\d+)\s*C\s*(\d+)(?![\w.])/.exec(src)
  if (bin && alone(src, bin)) return { kind: 'combinations', n: Number(bin[1]), r: Number(bin[2]) }
  const cnr = /\bC\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(src)
  if (cnr && alone(src, cnr) && (!/\p{L}/u.test(src.slice(0, cnr.index)) || /choose|combination|ways|select|committee/.test(low))) return { kind: 'combinations', n: Number(cnr[1]), r: Number(cnr[2]) }
  const fac = /^\s*(\d+)\s*!\s*(?:=.*|\?)?\s*$/s.exec(src)
  if (fac) return { kind: 'combinations', n: Number(fac[1]), r: null }
  // A question of chance that can't be read whole stops here (STOP): its numbers are no other kind
  const tree = readTree(src)
  if (tree !== undefined) return tree ?? STOP
  if (/\bdice\b|\bdie\b|🎲/.test(low) && (PCUE.test(low) || /\b(?:roll|rolls|rolled|rolling|throw|throws|thrown|throwing|launch\w*|toss\w*|cast)\b|\b(?:sum|total)\b/.test(low))) {
    const c = readDice(low)
    if (c) return { kind: 'chance', chance: c }
    if (PCUE.test(low)) return STOP
  } else if (/\bcoins?\b/.test(low) && PCUE.test(low) && /\bheads?\b|\btails?\b|\bp\s*\(\s*[ht]{1,4}\s*\)/.test(low)) {
    const c = readCoins(low)
    return c ? { kind: 'chance', chance: c } : STOP
  } else if (PCUE.test(low) && new RegExp(`(?<![\\d.])\\d+\\s+(?:${COLOURS})\\b`).test(low)) {
    const c = readBag(low)
    return c ? { kind: 'chance', chance: c } : STOP
  }
  // mean / average of a list, the whole list: "10, 20, and 30" (all three), and not the mean of
  // "5, 8 and x" (a missing value). 1,200 may be a thousand: no animation.
  const mean = /(?:mean|average|moyenne|media)\b[^\d-]*((?:-?\d+(?:\.\d+)?)(?:\s*(?:,\s*(?:and\s+)?|;\s*|\s+and\s+|&\s*|\s+)-?\d+(?:\.\d+)?)+)/i.exec(src)
  if (mean && alone(src, mean) && !/\d,\d{3}(?!\d)/.test(mean[1])) return { kind: 'mean', values: mean[1].split(/[^\d.-]+/).filter(Boolean).map(Number) }
  // percentages: 20% of 50, of 1,000 (or 1 000, 1\,000), of £45; the whole exercise
  const AMT = String.raw`(\d{1,3}(?:(?:,|\\,| )\d{3})+(?!\d)(?:\.\d+)?|\d+(?:\.\d+)?)`
  const pc = new RegExp(String.raw`(?<![\d.])(\d+(?:\.\d+)?)\s*(?:\\?%|percent\b|per cent\b)\s*(?:of\b|\\times|×|\*|x\b)\s*[£€$¥]?\s*${AMT}\s*[£€$¥]?`, 'i').exec(src)
  if (pc && alone(src, pc)) return { kind: 'percent', p: Number(pc[1]), of: Number(pc[2].replace(/,|\\,| /g, '')) }
  // trig of an angle in degrees: only when that is the whole exercise (sin 30°, \cos(120^\circ) =,
  // or with the student's answer after the "=": sin 30° = 0.6), not sin(2x) in a graph, an
  // integral or an equation, nor arcsin 0.5
  const tr = /^\s*\\?(sin|cos|tan)\s*\(?\s*(-?\d+(?:\.\d+)?)\s*(?:°|\^\s*\{?\s*\\circ\s*\}?|\\degree|deg(?:rees?)?)?\s*\)?\s*(?:=[^=a-zA-Z]*)?$/.exec(src.replace(/\\left|\\right/g, ''))
  if (tr) return { kind: 'trig', fn: tr[1], deg: Number(tr[2]) }
  // Pythagoras: 3^2 + 4^2 = c^2, 3^2 + b^2 = 5^2, 5^2 = 3^2 + b^2, a^2 + 4^2 = 5^2, \sqrt{3^2 + 4^2}.
  // The unknown is squared too (3^2 + 4^2 = x is just 25); it may be any letter in the usual
  // order (number first), else one of a, b, c, h (x^2 + 4^2 = 5^2 is an equation: x = ±3).
  const sq = src.replace(/²/g, '^2').replace(/\^\s*\{\s*2\s*\}/g, '^2')
  const N = '(\\d+(?:\\.\\d+)?)'
  const T = '(?:(\\d+(?:\\.\\d+)?)|(?<![\\w\\\\])([a-zA-Z]|[A-Z]{2}))\\s*\\^2'
  const [start, end] = ['(?<![-+*/^\\d.)]\\s*)', '(?!\\s*[-+*/^\\w.(])']
  const sumFirst = new RegExp(`${start}${T}\\s*\\+\\s*${T}\\s*=\\s*${T}${end}`).exec(sq)
  const sumLast = !sumFirst && new RegExp(`${start}${T}\\s*=\\s*${T}\\s*\\+\\s*${T}${end}`).exec(sq)
  const pm = sumFirst || sumLast
  if (pm) {
    const terms = [0, 1, 2].map((i) => ({ n: pm[2 * i + 1], l: pm[2 * i + 2] }))
    const [single, s1, s2] = sumFirst ? [terms[2], terms[0], terms[1]] : terms
    const letters = terms.filter((t) => t.l)
    const usual = sumFirst && s1.n !== undefined
    // (a side named by its ends, AC^2 = 3^2 + 4^2, is a side too)
    if (letters.length === 1 && (usual || /^[abchABCH]$|^[A-Z]{2}$/.test(letters[0].l))) {
      if (single.l) return { kind: 'pythagoras', a: Number(s1.n), b: Number(s2.n) }
      return { kind: 'pythagoras', a: Number(s1.l ? s2.n : s1.n), c: Number(single.n) }
    }
  }
  const py3 = new RegExp(`\\\\sqrt\\s*\\{\\s*${N}\\s*\\^2\\s*\\+\\s*${N}\\s*\\^2\\s*\\}`).exec(sq)
  if (py3) return { kind: 'pythagoras', a: Number(py3[1]), b: Number(py3[2]) }
  // logarithms and powers, when that is the whole exercise (log_2 8 + log_2 4, log_2 1/8 and
  // 2 × log_2 8 are not log_2 8)
  const lg = /(?<![\w\\])\\?log\s*_\s*(?:\{\s*(\d+)\s*\}|(\d+))\s*(?:\(\s*(\d+)\s*\)|\{\s*(\d+)\s*\}|(\d+))(?![\d.])/.exec(src)
  if (lg && alone(src, lg)) {
    const base = Number(lg[1] ?? lg[2])
    const of = Number(lg[3] ?? lg[4] ?? lg[5])
    const exp = Math.round(Math.log(of) / Math.log(base))
    if (base ** exp === of) return { kind: 'powers', base, exp, log: true }
  }
  const pw = /(?<![\w.^)}\\])(\d+)\s*\^\s*(?:\{\s*(\d+)\s*\}|(\d+))(?![\d.])/.exec(src)
  if (pw && alone(src, pw)) return { kind: 'powers', base: Number(pw[1]), exp: Number(pw[2] ?? pw[3]) }
  // two equations in x and y
  const ENV = '(?:cases|array|aligned|align\\*?|gathered|split)'
  const sys = src.replace(new RegExp(`\\\\left\\s*\\\\\\{|\\\\right\\s*\\.|\\\\begin\\{${ENV}\\}(?:\\{[^{}]*\\})?|\\\\end\\{${ENV}\\}|&`, 'g'), ' ')
  const eqs = sys.split(/\s*(?:,|;|\\\\|\\quad|\band\b|\n)\s*/).filter((t) => t.includes('='))
  if (eqs.length === 2 && /x/.test(sys) && /y/.test(sys)) {
    const e1 = linear2(eqs[0])
    const e2 = linear2(eqs[1])
    if (e1 && e2) return { kind: 'system', e1, e2 }
  }
  // inequalities in x
  // (\left( is not \le followed by "ft(")
  const isrc = src.replace(/\\left|\\right/g, ' ')
  const rel = /(<=|>=|≤|≥|\\(?:leqslant|geqslant|leq|geq|le|ge|lt|gt)(?![a-zA-Z])|<|>)/.exec(isrc)
  if (rel && /x/.test(isrc)) {
    const [l, r] = [isrc.slice(0, rel.index), isrc.slice(rel.index + rel[1].length)]
    try {
      const left = linear(compile(l))
      const right = linear(compile(r))
      if (left && right) return { kind: 'inequality', left, right, rel: REL[rel[1]] }
    } catch {
      // not a linear inequality
    }
  }
  return null
}

/** Rules: the scene for an exercise written on paper (LaTeX or plain), or null. */
// An exercise is a line or two; longer text is no exercise (and would only slow the rules down)
const MAX_EXERCISE = 1000

// The exercise as the rules read it: − and – are minus signs, ² and ³ powers, \text{ of } the word
// "of", \mathrm{d}x is dx; and a label (1), a), Q2.) or an instruction (Solve, Work out...) in
// front of it is not part of it ("Solve: $2x+5=11$" is 2x + 5 = 11).
function tidy(src) {
  let s = src
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\\(?:mathrm|operatorname|text|textrm|mbox)\s*\{\s*d\s*\}/g, ' d')
    .replace(/\\(?:text|textrm|mbox)\s*\{([^{}]*)\}/g, ' $1 ')
  s = s.replace(/^\s*(?:\(?[a-hA-H]\)(?=\s)|\(?\d{1,2}\)(?=\s)|Q\s*\d{1,2}\s*(?:[.):]|\s)|q\d{1,2}[.):]|\d{1,2}\.(?=\s)|[a-h]\.(?=\s))\s*/, '')
  // (with the unknown it names: "Find x: 2x + 3 = 11", "Solve for x:")
  s = s.replace(/^(?:solve|calculate|work out|simplify|evaluate|compute|find|what is|what's|write down)\b(?:\s+the value of\b)?(?:\s+for)?(?:\s+[a-z](?=\s*[:,]))?\s*[:,]?\s*/i, '')
  return s.replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
}

// a/b + c/d or a/b - c/d, as written (spaces, brackets and \frac allowed), and nothing else:
// 1/(2 + 3/4) and (1/2 + 1)/3 are not the sum of two fractions. -> { n1, d1, op, n2, d2 } or null
function fracSum(expr) {
  const F = String.raw`\(*\s*\(?\s*(\d+)\s*\)?\s*\/\s*\(?\s*(\d+)\s*\)?\s*\)*`
  const m = new RegExp(`^\\s*${F}\\s*([+-])\\s*${F}\\s*$`, 'd').exec(expr)
  if (!m) return null
  const at = m.indices[3][0]
  const balanced = (t) => {
    let depth = 0
    for (const ch of t) if ((depth += ch === '(' ? 1 : ch === ')' ? -1 : 0) < 0) return false
    return depth === 0
  }
  if (!balanced(expr.slice(0, at)) || !balanced(expr.slice(at + 1))) return null
  const [n1, d1, n2, d2] = [m[1], m[2], m[4], m[5]].map(Number)
  const want = m[3] === '+' ? n1 / d1 + n2 / d2 : n1 / d1 - n2 / d2
  try {
    if (!(Math.abs(compile(expr, [])() - want) <= 1e-9 * Math.max(1, Math.abs(want)))) return null
  } catch {
    return null
  }
  return { n1, d1, op: m[3], n2, d2 }
}

export function detectScene(text) {
  // Reading and Science first: their rules only answer to their own words and units
  // ("syllables in…", "3.5 km to m", "a 9 V battery"), so maths is never taken for them
  const domain = detectDomain(text)
  if (domain) return domain
  // runs of spaces are one space (line breaks are kept: they separate the equations of a system)
  let src = String(text ?? '').replace(/\$/g, '').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
  if (src.length > MAX_EXERCISE) return null
  src = tidy(src)
  // OCR often reads the integral sign as S or f: "S_0^1 ... dx"
  if (/\bd\s*[a-z]\b/.test(src)) src = src.replace(/(^|[^\\a-zA-Z])[Sf∫]\s*(?=[_^])/, '$1\\int')
  const special = detectSpecial(src)
  if (special === STOP) return null
  if (special) return special
  // definite integral
  const m = readIntegral(src)
  if (m) return { kind: 'area', expression: m.body, from: num(m.lo), to: num(m.hi), fromTex: m.lo, toTex: m.hi, variable: m.variable, tex: src }
  const plain = toExpr(src)
  // 1 + 2 + ... + n: n is the last term (1 + 2 + ... + 99 + 100 is up to 100), the terms
  // written out go up by one, and n is a number (not 10n)
  // Also any evenly spaced sum (2 + 4 + 6 + ... + 100, 5 + 10 + ... + 2 × 50): the same trick.
  const dotted = src.replace(/\\ldots|\\cdots|\\dots|⋯/g, '...').replace(/\s*(?:\\times|\\cdot|×|\*)\s*/g, 'x')
  const pairs = /^((?:\d+\s*\+\s*){2,})(?:\.\.\.|…)((?:\s*\+\s*\d+(?:\s*x\s*\d+)?(?![\w.]))+)\s*(?:=.*)?$/.exec(dotted)
  if (pairs) {
    const val = (t) => t.split('x').reduce((p, v) => p * Number(v), 1)
    const head = pairs[1].split('+').map((t) => t.trim()).filter(Boolean).map(val)
    const tail = pairs[2].split('+').map((t) => t.trim()).filter(Boolean).map(val)
    const d = head[1] - head[0]
    const steps = (ns) => ns.every((v, i) => i === 0 || v === ns[i - 1] + d)
    const last = tail[tail.length - 1]
    if (d > 0 && steps(head) && steps(tail) && tail[0] > head[head.length - 1] && (tail[0] - head[head.length - 1]) % d === 0)
      return { kind: 'pairs', expression: head[0] === 1 && d === 1 ? String(last) : `${head[0]},${d},${last}` }
  }
  // y = f(x) / f(x) = ...: drawn as written (y = \frac{1}{x}, not ((1)/(x)))
  const fn = /^(?:y|f\s*\(\s*x\s*\))\s*=\s*(.+)$/.exec(plain)
  if (fn && /x/.test(fn[1])) {
    const written = /^(?:y|f\s*(?:\\left)?\(\s*x\s*(?:\\right)?\))\s*=\s*(.+)$/.exec(src)
    return { kind: 'graph', expression: written && /\\|\{/.test(written[1]) ? written[1].trim() : fn[1] }
  }
  // an equation with x: a parabola (degree 2) or a balance (degree 1)
  const sides = plain.replace(/=+\s*$/, '').split('=')
  if (sides.length === 2 && /x/.test(plain) && sides.every((s) => s.trim())) {
    try {
      const L = compile(sides[0])
      const R = compile(sides[1])
      const q = quad((x) => L(x) - R(x))
      if (q && Math.abs(q.a) > 1e-9 * Math.max(1, Math.abs(q.b), Math.abs(q.c))) return { kind: 'quadratic', A: q.a, B: q.b, C: q.c }
    } catch {
      // not a polynomial: the balance decides
    }
    return { kind: 'balance', expression: plain.replace(/=+\s*$/, '') }
  }
  // a op b (whole numbers or fractions), maybe with "= ..." after
  const lhs = sides[0].trim()
  if (fracSum(lhs)) return { kind: 'fractions', expression: lhs }
  // several operations (3 + 4 × 2, (5 + 3) × 2 − 4): the order of operations. Not with fractions
  // in it: \frac{1}{2} \times 42 or 1/2 ÷ 1/4 would be worked in decimals, with brackets nobody
  // wrote (and 1/2 ÷ 1/4 read as 1 ÷ 2 ÷ 1 ÷ 4)
  const ops = (lhs.match(/[-+*/^]/g) || []).length
  // (the left side only: an answer written as a fraction, 3 / 2 + 1 = \frac{5}{2}, is no reason)
  const srcLeft = src.split('=')[0]
  const fractions = /\\[dt]?frac\s*\{\s*\d+\s*\}\s*\{\s*\d+\s*\}/.test(srcLeft) || (/\d\s*\/\s*\d/.test(srcLeft) && /÷|\\div(?![a-zA-Z])|\d\s*:\s*\d/.test(srcLeft))
  if (!fractions && /^[\d\s+\-*/^().]+$/.test(lhs) && (ops >= 2 || /[()]/.test(lhs)) && !/^\s*\(?\s*\d+\s*\)?\s*$/.test(lhs)) return { kind: 'order_ops', expression: lhs }
  const div = /^(\d+)\s*\/\s*(\d+)$/.exec(lhs)
  if (div && Number(div[1]) >= Number(div[2])) return { kind: 'sharing', n: Number(div[1]), d: Number(div[2]) }
  const ab = /^(\d+)\s*([+\-*/x])\s*(\d+)$/.exec(lhs.replace(/×/g, '*'))
  if (ab) {
    const [a, op, b] = [Number(ab[1]), ab[2], Number(ab[3])]
    if (op === '*' || op === 'x') return { kind: a <= 12 && b <= 12 ? 'groups' : 'area_model', expression: `${a}*${b}` }
    if (op === '+' || op === '-') return { kind: a + b <= 20 ? 'count' : a < 100 && b < 100 ? 'number_line' : 'columns', expression: `${a}${op}${b}` }
  }
  return null
}

// Builds a scene from a choice { kind, expression, from?, to?, antiderivative?, variable? }.
export function buildScene(choice, { age } = {}) {
  if (!choice || !SCENE_KINDS.includes(choice.kind)) return null
  const kind = choice.kind
  const skin = skinFor(kind, age)
  if (DOMAIN_KINDS.includes(kind)) return buildDomain(choice, skin)
  const expr = toExpr(choice.expression ?? '')
  try {
    if (kind === 'count' || kind === 'number_line') {
      const m = /^\(?(-?\d+)\)?\s*([+-])\s*\(?(\d+)\)?$/.exec(expr.replace(/=.*$/, '').trim())
      if (!m) return null
      const args = { a: Number(m[1]), b: Number(m[3]), op: m[2] }
      return kind === 'count' ? buildCount(args, skin) : buildNumberLine(args, skin)
    }
    if (kind === 'columns' || kind === 'area_model' || kind === 'sharing') {
      const m = /^\(?(\d+)\)?\s*([+\-*/])\s*\(?(\d+)\)?$/.exec(choice.n !== undefined ? `${choice.n}/${choice.d}` : expr.replace(/=.*$/, '').trim())
      if (!m) return null
      const [a, op, b] = [Number(m[1]), m[2], Number(m[3])]
      if (kind === 'columns') return op === '+' || op === '-' ? buildColumns({ a, b, op }, skin) : null
      if (kind === 'area_model') return op === '*' ? buildAreaModel({ a, b }, skin) : null
      return op === '/' ? buildSharing({ n: a, d: b }, skin) : null
    }
    if (kind === 'percent') return buildPercent({ p: Number(choice.p), of: Number(choice.of) }, skin)
    if (kind === 'powers') return buildPowers({ base: Number(choice.base), exp: Number(choice.exp), log: choice.log }, skin)
    if (kind === 'order_ops') return buildOrderOps({ expression: choice.expression }, skin)
    if (kind === 'pythagoras') return buildPythagoras({ a: Number(choice.a), b: choice.b === undefined ? NaN : Number(choice.b), c: choice.c === undefined ? NaN : Number(choice.c) }, skin)
    if (kind === 'mean') return buildMean({ values: choice.values }, skin)
    if (kind === 'inequality') return buildInequality({ left: choice.left, right: choice.right, rel: choice.rel }, skin)
    if (kind === 'trig') return buildTrig({ fn: choice.fn, deg: Number(choice.deg) }, skin)
    if (kind === 'quadratic') return buildQuadratic({ A: choice.A, B: choice.B, C: choice.C }, skin)
    if (kind === 'system') return buildSystem({ e1: choice.e1, e2: choice.e2 }, skin)
    if (kind === 'chance') return buildChance(choice.chance || {}, skin)
    if (kind === 'combinations') return buildCombinations({ n: Number(choice.n), r: choice.r === null || choice.r === undefined ? null : Number(choice.r) }, skin)
    if (kind === 'tree') return buildTree({ pA: choice.pA, pB: choice.pB, nameA: choice.nameA, nameB: choice.nameB, fracA: choice.fracA, fracB: choice.fracB }, skin)
    if (kind === 'limit') {
      const v = choice.variable || 'x'
      return buildLimit({ f: compile(choice.expression, v), fTex: plainToTex(String(choice.expression).trim()), a: choice.to, variable: v, side: choice.side ?? null }, skin)
    }
    if (kind === 'derivative') {
      const v = choice.variable || 'x'
      let df = null
      if (choice.derivative) {
        try {
          df = compile(String(choice.derivative), v)
        } catch {
          df = null
        }
      }
      return buildDerivative({ f: compile(choice.expression, v), fTex: plainToTex(String(choice.expression).trim()), x0: Number.isFinite(choice.at) ? choice.at : 1, dTex: df ? plainToTex(String(choice.derivative)) : null, df }, skin)
    }
    if (kind === 'groups') {
      const m = /^\(?(\d+)\)?\s*[*x]\s*\(?(\d+)\)?$/.exec(expr.replace(/=.*$/, '').trim())
      return m ? buildGroups({ a: Number(m[1]), b: Number(m[2]) }, skin) : null
    }
    if (kind === 'fractions') {
      const m = fracSum(expr.replace(/=.*$/, '').trim())
      return m ? buildFractions(m, skin) : null
    }
    if (kind === 'balance') {
      const sides = expr.split('=')
      if (sides.length !== 2) return null
      const left = linear(compile(sides[0]))
      const right = linear(compile(sides[1]))
      return left && right ? buildBalance({ left, right }, skin) : null
    }
    if (kind === 'pairs') {
      const e = String(choice.expression)
      if (/^\d+,\d+,\d+$/.test(e)) {
        const [a, d, l] = e.split(',').map(Number)
        return buildPairs({ a, d, l }, skin)
      }
      return buildPairs({ n: Number(e.replace(/[^\d]/g, '')) }, skin)
    }
    if (kind === 'area') {
      const variable = choice.variable || 'x'
      const f = compile(choice.expression, variable)
      let F = null
      if (choice.antiderivative) {
        try {
          F = compile(String(choice.antiderivative).replace(/\+\s*C\s*$/i, ''), variable)
        } catch {
          F = null
        }
      }
      return buildArea({ f, fTex: plainToTex(String(choice.expression).trim()), a: Number(choice.from), b: Number(choice.to), aTex: choice.fromTex, bTex: choice.toTex, F, FTex: F ? plainToTex(String(choice.antiderivative).replace(/\+\s*C\s*$/i, '').trim()) : '', variable }, skin)
    }
    if (kind === 'graph') return buildGraph({ f: compile(choice.expression), fTex: plainToTex(String(choice.expression).trim()) }, skin)
  } catch {
    return null
  }
  return null
}

/**
 * The decision: the model's choice first (checked by building it), then the rules on the
 * exercise as written, then nothing (the written explanation alone).
 */
export function pickScene({ exercise, choice, age }) {
  const fromModel = choice && choice.kind !== 'none' ? buildScene(choice, { age }) : null
  if (fromModel) return { ...fromModel, decidedBy: 'model' }
  const rule = detectScene(exercise)
  if (rule) {
    // the model's antiderivative can still help an integral found by the rules
    const built = buildScene({ ...rule, antiderivative: rule.kind === 'area' ? choice?.antiderivative : undefined }, { age })
    if (built) return { ...built, decidedBy: 'rules' }
  }
  return null
}

// A line that only makes sense in its subject: a word or a sentence on a reading page. A word
// alone is checked against the tutor's right spelling (`answer`), never taught as written.
function subjectRule(exercise, kind, subject, answer) {
  const text = String(exercise ?? '').replace(/\$/g, '').replace(/\\text\{([^}]*)\}/g, '$1').trim()
  const word = /^[A-Za-z]{2,24}$/.test(text) ? text : null
  const right = typeof answer === 'string' ? answer.replace(/\\text\{([^}]*)\}|\$/g, '$1').trim() : ''
  if (word && kind && WORD_KINDS.includes(kind)) {
    const r = wordRule(word, kind)
    return r && kind === 'spelling' ? (/^[A-Za-z]{2,24}$/.test(right) ? { ...r, word: right } : null) : r
  }
  if (subject !== 'reading') return null
  if (word && /^[A-Za-z]{2,24}$/.test(right) && right.toLowerCase() !== word.toLowerCase()) return { kind: 'spelling', attempt: word, word: right }
  if (/^[A-Za-z][A-Za-z ,'’;:!?.-]+$/.test(text) && text.split(/\s+/).length >= 3) return { kind: 'sentence', sentence: text }
  return null
}

const COMPATIBLE = [['count', 'number_line', 'columns'], ['groups', 'area_model']]
const compatible = (a, b) => a === b || COMPATIBLE.some((g) => g.includes(a) && g.includes(b))

/**
 * The decision with a classifier (Laya): `kind` says which animation; the rules read the
 * numbers from what was written and the builder checks them. If the two disagree, or the
 * classifier is unsure or unavailable, the rules decide (they only match what they can compute).
 */
export function sceneFor({ exercise, kind, age, antiderivative, derivative, subject, answer }) {
  const rule = detectScene(exercise) ?? subjectRule(exercise, kind, subject, answer)
  if (rule && derivative) rule.derivative = derivative
  if (!rule) return null
  const tex = rule.tex ?? null // the exercise with OCR slips fixed (S -> \\int)
  if (kind && kind !== 'none' && compatible(kind, rule.kind)) {
    const s = buildScene({ ...rule, kind, antiderivative }, { age })
    if (s) return { ...s, exerciseTex: tex, decidedBy: 'laya' }
  }
  for (const k of [rule.kind, ...(COMPATIBLE.find((g) => g.includes(rule.kind)) ?? []).filter((x) => x !== rule.kind)]) {
    const s = buildScene({ ...rule, kind: k, antiderivative }, { age })
    if (s) return { ...s, exerciseTex: tex, decidedBy: 'rules' }
  }
  return null
}
