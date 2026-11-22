// Exact maths for the Glimpse engine (ported from engine/glimpse_engine/tutor).
//
// Fractions are kept EXACTLY as written: 4/6 is not 2/3 here. "Adds across" turns
// 3/4 + 1/2 into 4/6, and only the unreduced form tells that apart from other mistakes.

export const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a))
export const lcm = (a, b) => (a / gcd(a, b)) * b

export const F = (n, d) => ({ n, d })
export const fstr = (f) => `${f.n}/${f.d}`
export const flatex = (f) => (f.d === 1 ? String(f.n) : `\\frac{${f.n}}{${f.d}}`)
export const sameForm = (a, b) => a.n === b.n && a.d === b.d
export const sameValue = (a, b) => a.n * b.d === b.n * a.d
export const less = (a, b) => a.n * b.d < b.n * a.d // denominators are positive
export const addExact = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d)
export const reduce = (f) => {
  const g = gcd(f.n, f.d) || 1
  return F(f.n / g, f.d / g)
}
export const sumLatex = (a, b, ans) => `${flatex(a)}+${flatex(b)}${ans ? `=${flatex(ans)}` : ''}`

// ---------- reading what the OCR wrote ----------

const UNICODE_FRACTIONS = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' }

// A line of arithmetic is short; anything longer is not checked (and never reaches a regex).
const MAX_LINE = 1000
// \frac{A}{B}: no overlapping quantifiers, so a missing "}" can't make it backtrack for ages.
const FRAC = /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g
// A whole number, a space, then a fraction is a mixed number: "1 1/2" (also "1½", "1\frac{1}{2}").
const MIXED = /(?<![\d./])(\d+)\s+(\d+)\s*\/\s*(\d+)(?![\d.])/g
// One part of \frac{..}{..}: a number stays as it is, an expression keeps its brackets.
const fracPart = (x) => {
  const t = x.trim()
  return /^(\d+(\.\d+)?|\.\d+)$/.test(t) ? t : `(${t})`
}

// The rest of a line after its exercise label: mixed numbers, no spaces, only arithmetic left.
function finishPlain(text) {
  let s = text.replace(/÷/g, ':').replace(MIXED, '($1+$2/$3)').trim()
  if (/[a-zA-Z]/.test(s)) return ''
  s = s.replace(/\s+/g, '').replace(/(\d)\.$/, '$1') // "2+2=4." ends with a full stop
  return /\d/.test(s) && /^[0-9+\-*/:=().]+$/.test(s) ? s : ''
}

// GLM-OCR text ("$ \frac{3}{4}+\frac{1}{2}=\frac{4}{6} $", "3/4 + 1/2 = 4/6", "¾ + ½ = 4/6")
// -> plain "3/4+1/2=4/6", or '' if it is not an arithmetic line (words, letters...).
// Plain uses + - * ( ) =, ":" for division (÷, \div, 8 : 4) and "/" for a fraction bar:
// "1/2:1/4" is ½ ÷ ¼, a mixed number "1 1/2" is "(1+1/2)", \frac{3+5}{2} is "(3+5)/2".
export function toPlain(text) {
  let s = String(text || '')
  if (s.length > MAX_LINE) return ''
  for (const [u, p] of Object.entries(UNICODE_FRACTIONS)) s = s.split(u).join(` ${p} `)
  s = s
    .replace(FRAC, (_, a, b) => ` ${fracPart(a)}/${fracPart(b)} `)
    .replace(/\$|\\\(|\\\)|\\\[|\\\]/g, ' ')
    .replace(/\\(left|right|displaystyle|quad|,|;|!)/g, ' ')
    .replace(/\\times|×|\\cdot|·/g, '*')
    .replace(/\\div/g, '÷') // becomes ":" after the label, so "3\div 5" is never "exercise 3"
    .replace(/[−–]/g, '-')
    // "6 x 7": an x between two numbers is a times sign (also before a negative number written
    // apart, "3 x -2"; "3x -2" stays an expression in x)
    .replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1*')
    .replace(/(\d)\s+[xX]\s+(?=-\d)/g, '$1*')
  // a leading exercise label: "1) ", "2. ", "a) ", "(c) ", "b: "
  const label = s.match(/^\s*\(?(?:\d+[).]|[a-zA-Z][).:])\s+/)
  if (label) return finishPlain(s.slice(label[0].length))
  // "8: 4 = 2" is 8 divided by 4, but "3: 2+2=4" is exercise 3: take the reading that checks
  // out, else the label only when what follows is a sum of its own.
  const colon = s.match(/^\s*\d+:\s+/)
  if (colon) {
    const asDivision = finishPlain(s)
    const asLabel = finishPlain(s.slice(colon[0].length))
    const right = (p) => Boolean(p) && checkEquation(p) === true
    if (right(asDivision) !== right(asLabel)) return right(asLabel) ? asLabel : asDivision
    return /[+\-*]/.test(asLabel.split('=')[0]) ? asLabel : asDivision
  }
  return finishPlain(s)
}

// "a/b+c/d=e/f" (exact forms) or null. Null too when the numbers are too big to check exactly.
export function parseSum(plain) {
  const m = String(plain).match(/^(\d+)\/(\d+)\+(\d+)\/(\d+)=(\d+)\/(\d+)$/)
  if (!m) return null
  const [a, b, c, d, e, f] = m.slice(1).map(Number)
  if (!b || !d || !f) return null
  // every product the checks and the misconception library make must stay exact
  const top = a * d + c * b
  if (![top * f, e * b * d, a * c * b * d, top * b * d].every(Number.isSafeInteger)) return null
  return { a: F(a, b), b: F(c, d), ans: F(e, f) }
}

// The plain grammar, as a tree (so the value and the LaTeX always agree):
//   sum := term (+|- term)*   term := quot (*|: quot)*   quot := factor (/ factor)*
//   factor := ( sum ) | -factor | number, and a/b written with whole numbers is ONE number,
// a fraction: 1/2:1/4 is (1/2)÷(1/4), 6:2/3 is 6÷(2/3). Throws on anything else.
const NUM = /\d+(?:\.\d+)?|\.\d+/y
const WHOLE = /\d+(?![\d.])/y
function parsePlain(src) {
  let i = 0
  const peek = () => src[i]
  const take = (re) => {
    re.lastIndex = i
    const m = re.exec(src)
    if (m) i = re.lastIndex
    return m?.[0]
  }
  function factor() {
    if (peek() === '(') {
      i++
      const e = sum()
      if (peek() !== ')') throw new Error(') expected')
      i++
      return { t: 'paren', e }
    }
    if (peek() === '-') {
      i++
      return { t: 'neg', e: factor() }
    }
    const text = take(NUM)
    if (text === undefined) throw new Error('number expected')
    if (/^\d+$/.test(text) && peek() === '/') {
      const at = i
      i++
      const bottom = take(WHOLE)
      if (bottom !== undefined) return { t: 'frac', top: text, bottom }
      i = at
    }
    return { t: 'num', text }
  }
  const level = (next, ops) => () => {
    let l = next()
    while (ops.includes(peek())) {
      const op = src[i++]
      l = { t: 'op', op, l, r: next() }
    }
    return l
  }
  const quot = level(factor, ['/'])
  const term = level(quot, ['*', ':'])
  const sum = level(term, ['+', '-'])
  const tree = sum()
  if (i !== src.length) throw new Error('unexpected ' + src[i])
  return tree
}

// Exact value of a tree; throws when a number would be too big to be exact.
function valueOf(node) {
  const safe = (f) => {
    const r = reduce(f)
    if (!Number.isSafeInteger(r.n) || !Number.isSafeInteger(r.d)) throw new Error('too big')
    return r
  }
  const div = (a, b) => {
    if (b.n === 0) throw new Error('divide by zero')
    return safe(b.n < 0 ? F(-a.n * b.d, -a.d * b.n) : F(a.n * b.d, a.d * b.n))
  }
  switch (node.t) {
    case 'num': {
      const [whole, part = ''] = node.text.split('.')
      return safe(F(Number(whole + part), 10 ** part.length))
    }
    case 'frac':
      return div(F(Number(node.top), 1), F(Number(node.bottom), 1))
    case 'paren':
      return valueOf(node.e)
    case 'neg': {
      const v = valueOf(node.e)
      return F(-v.n, v.d)
    }
    default: {
      const a = valueOf(node.l)
      const b = valueOf(node.r)
      if (node.op === '+') return safe(F(a.n * b.d + b.n * a.d, a.d * b.d))
      if (node.op === '-') return safe(F(a.n * b.d - b.n * a.d, a.d * b.d))
      if (node.op === '*') return safe(F(a.n * b.n, a.d * b.d))
      return div(a, b)
    }
  }
}

// Exact rational evaluation of + - * : / ( ) with whole numbers and decimals. Returns {n,d}
// (reduced) or null.
export function evaluate(expr) {
  try {
    return valueOf(parsePlain(String(expr)))
  } catch {
    return null
  }
}

// "(1+1/2)": a mixed number, as toPlain writes it.
const isMixed = (node) => node.t === 'paren' && node.e.t === 'op' && node.e.op === '+' && node.e.l.t === 'num' && /^\d+$/.test(node.e.l.text) && node.e.r.t === 'frac'
// a/b between two numbers or bracketed groups is drawn as a fraction bar: \frac{3+5}{2}
const barSide = (x) => x.t === 'num' || (x.t === 'paren' && !isMixed(x))
const isBar = (node) => node.t === 'op' && node.op === '/' && barSide(node.l) && barSide(node.r)

function latexOf(node) {
  switch (node.t) {
    case 'num':
      return node.text
    case 'frac':
      return `\\frac{${node.top}}{${node.bottom}}`
    case 'paren':
      return isMixed(node) ? `${node.e.l.text}${latexOf(node.e.r)}` : `(${latexOf(node.e)})`
    case 'neg':
      return `-${latexOf(node.e)}`
    default: {
      const inner = (x) => (x.t === 'paren' ? latexOf(x.e) : latexOf(x))
      if (isBar(node)) return `\\frac{${inner(node.l)}}{${inner(node.r)}}`
      const l = latexOf(node.l)
      const r = latexOf(node.r)
      if (node.op === '*') return `${l}\\times ${r}`
      // 6:(1/2/3) drawn as 6÷1/2÷3 would read (6÷½)÷3: keep the brackets the plain form implies
      if (node.op === ':') return `${l}\\div ${node.r.t === 'op' && !isBar(node.r) ? `(${r})` : r}`
      if (node.op === '/') return `${l}\\div ${r}`
      return `${l}${node.op}${r}`
    }
  }
}

// LaTeX for a plain expression: a/b -> \frac{a}{b}, * -> \times, : -> \div, (1+1/2) -> 1\frac{1}{2}.
export function plainToLatex(plain) {
  return String(plain)
    .split('=')
    .map((side) => {
      try {
        return latexOf(parsePlain(side))
      } catch {
        return side
          .replace(/(?<![\d.])(\d+)\/(\d+)(?![\d.])/g, '\\frac{$1}{$2}')
          .replace(/\*/g, '\\times ')
          .replace(/[/:]/g, '\\div ')
      }
    })
    .join('=')
}

// ---------- checking ----------

// 'correct' | 'unsimplified' | 'wrong' for a + b = ans
export function checkSum(a, b, ans) {
  if (!sameValue(ans, addExact(a, b))) return 'wrong'
  return gcd(ans.n, ans.d) > 1 ? 'unsimplified' : 'correct'
}

// Any line "left = right": are both sides equal? null if it can't be evaluated.
export function checkEquation(plain) {
  const sides = String(plain).split('=')
  if (sides.length !== 2 || !sides[0] || !sides[1]) return null
  const l = evaluate(sides[0])
  const r = evaluate(sides[1])
  if (!l || !r) return null
  return sameForm(l, r) // both reduced, with a positive bottom
}

// ---------- misconception library ----------
// A bug maps the problem to the answer a child with that misconception would write,
// unreduced. A diagnosis only counts when a bug reproduces the child's EXACT answer.

export const BUGS = [
  { id: 'adds_across', name: 'Adds the tops and the bottoms', label: 'added the tops and the bottoms', fn: (a, b) => F(a.n + b.n, a.d + b.d) },
  { id: 'no_scaling', name: 'Common bottom by multiplying, top not scaled', label: 'changed the bottom, not the top', fn: (a, b) => F(a.n + b.n, a.d * b.d) },
  { id: 'lcd_no_scaling', name: 'Smallest common bottom, top not scaled', label: 'changed the bottom, not the top', fn: (a, b) => F(a.n + b.n, lcm(a.d, b.d)) },
  { id: 'keeps_bigger_bottom', name: 'Adds the tops, keeps the bigger bottom', label: 'kept one of the bottoms', fn: (a, b) => F(a.n + b.n, Math.max(a.d, b.d)) },
  { id: 'multiplies', name: 'Multiplies instead of adding', label: 'multiplied instead of adding', fn: (a, b) => F(a.n * b.n, a.d * b.d) },
  { id: 'right_top_adds_bottoms', name: 'Right top, but adds the bottoms', label: 'added the bottoms', fn: (a, b) => F(a.n * b.d + b.n * a.d, a.d + b.d) },
]

export function diagnose(a, b, ans) {
  return BUGS.filter((bug) => {
    const p = bug.fn(a, b)
    return p.d !== 0 && sameForm(p, ans) && !sameValue(p, addExact(a, b))
  })
}

// ---------- what went wrong in a sum on whole numbers ----------
// "47 + 38 = 75" -> "forgot to carry the ten". The slip when one explains the child's exact answer
// (specific: true), or else a way to check it backwards ("12 − 5 = 8": "8 + 5 should make 12"),
// which helps find the mistake without giving the answer. null: not a wrong a ○ b = c on whole numbers.
export function arithmeticNote(plain) {
  const m = String(plain ?? '').replace(/\s+/g, '').match(/^(\d{1,6})([+\-*x×:÷/])(\d{1,6})=(\d{1,7})$/)
  if (!m) return null
  const [a, b, r] = [Number(m[1]), Number(m[3]), Number(m[4])]
  const op = m[2] === '+' ? '+' : m[2] === '-' ? '-' : /[*x×]/.test(m[2]) ? '*' : '/'
  const right = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b && a % b === 0 ? a / b : null
  if (right === null || right === r) return null
  const flip = (n) => Number(String(n).split('').reverse().join(''))
  const say = (note, specific = true) => ({ note, specific })
  if (r >= 10 && right >= 10 && flip(r) === right) return say('swapped the two digits of the answer round')
  if (op === '+') {
    if (r === a - b || r === b - a) return say('took away instead of adding')
    if (right - r === 10 && (a % 10) + (b % 10) >= 10) return say('forgot to carry the ten')
    if (r - right === 10) return say('had one ten too many: add the tens again')
    if (Math.abs(r - right) === 1) return say('were 1 out: count on again carefully')
    return say(`it doesn't check out: ${r} − ${b} should give back ${a}`, false)
  }
  if (op === '-') {
    if (r === a + b) return say('added instead of taking away')
    if (a % 10 < b % 10 && r === (b % 10) - (a % 10) + 10 * (Math.floor(a / 10) - Math.floor(b / 10))) return say('took the smaller digit from the bigger one in the ones')
    if (a >= 10 && r - right === 10 && a % 10 < b % 10) return say('forgot to exchange a ten (borrow)')
    if (Math.abs(r - right) === 1) return say('were 1 out: count back again carefully')
    return say(`it doesn't check out: ${r} + ${b} should make ${a}`, false)
  }
  if (op === '*') {
    if (r === a + b) return say('added instead of multiplying')
    if (Math.abs(r - right) === a || Math.abs(r - right) === b) return say(`were one group out: ${b} lots of ${a}, count the groups again`)
    return say(`it doesn't check out: ${b} lots of ${a} don't make ${r}`, false)
  }
  if (r === a - b) return say('took away instead of dividing')
  return say(`it doesn't check out: ${r} × ${b} should make ${a}`, false)
}
