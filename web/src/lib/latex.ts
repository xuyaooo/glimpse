// Tiny helpers for the reader's LaTeX subset.

export type Token = { kind: 'frac'; n: string; d: string } | { kind: 'text'; v: string }

const FRAC = /\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g

// The symbols a line can have, as the characters a hand writes them (x = \pm 12 -> x = ±12).
const SYMBOLS: [RegExp, string][] = [
  [/\\left(?![a-zA-Z])|\\right(?![a-zA-Z])/g, ''],
  [/\\[,;:! ]/g, ' '],
  [/\\times(?![a-zA-Z])/g, '×'],
  [/\\div(?![a-zA-Z])/g, '÷'],
  [/\\cdot(?![a-zA-Z])/g, '·'],
  [/\\pm(?![a-zA-Z])/g, '±'],
  [/\\mp(?![a-zA-Z])/g, '∓'],
  [/\\leq?(?![a-zA-Z])/g, '≤'],
  [/\\geq?(?![a-zA-Z])/g, '≥'],
  [/\\neq?(?![a-zA-Z])/g, '≠'],
  [/\\approx(?![a-zA-Z])/g, '≈'],
  [/\\pi(?![a-zA-Z])/g, 'π'],
  [/\\infty(?![a-zA-Z])/g, '∞'],
  [/\^\{?\\circ\}?|\\circ(?![a-zA-Z])/g, '°'],
  [/\\sqrt\{([^{}]*)\}/g, '√$1'],
  [/\^(?:2|\{2\})(?!\d)/g, '²'],
  [/\^(?:3|\{3\})(?!\d)/g, '³'],
]
const handwritten = (s: string) => SYMBOLS.reduce((t, [re, ch]) => t.replace(re, ch), s)

/** Split into fractions and everything else, e.g. to draw a part as handwriting in demo mode. */
export function tokens(latex: string): Token[] {
  const out: Token[] = []
  const pushText = (s: string) => {
    for (const piece of handwritten(s).split(/\s+/)) if (piece) out.push({ kind: 'text', v: piece })
  }
  let last = 0
  for (const m of latex.matchAll(FRAC)) {
    pushText(latex.slice(last, m.index))
    out.push({ kind: 'frac', n: handwritten(m[1]).trim(), d: handwritten(m[2]).trim() })
    last = (m.index ?? 0) + m[0].length
  }
  pushText(latex.slice(last))
  return out
}

/** "a/b + c/d = e/f" as numbers, or null if the part isn't a fraction sum. */
export function parseSum(latex: string): { a: [number, number]; b: [number, number]; ans: [number, number] } | null {
  const t = tokens(latex)
  if (t.length !== 5 || t[0].kind !== 'frac' || t[2].kind !== 'frac' || t[4].kind !== 'frac') return null
  const n = (x: Token) => (x.kind === 'frac' ? ([Number(x.n), Number(x.d)] as [number, number]) : ([0, 1] as [number, number]))
  return { a: n(t[0]), b: n(t[2]), ans: n(t[4]) }
}

/**
 * The same text for a line of LaTeX and for what a child types to find it: \frac{1}{2} and 1/2,
 * \times, \cdot, ×, * and 6x89 all as ×, \div and ÷ as /, no spaces or braces, lower case.
 */
export function searchKey(s: string) {
  return s
    .replace(FRAC, '$1/$2')
    .replace(/\\times|\\cdot|[×·*]/g, '×')
    .replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1×')
    .replace(/\\div|÷/g, '/')
    .replace(/\\left|\\right|\\[,;:! ]|[\s{}$]/g, '')
    .toLowerCase()
}

export const frac = (n: number, d: number) => `\\frac{${n}}{${d}}`
export const sum = (a: [number, number], b: [number, number], ans?: [number, number]) => `${frac(...a)}+${frac(...b)}${ans ? `=${frac(...ans)}` : ''}`

// An exercise's title as LaTeX: maths stays maths, words stay words. "sum of 7 with two dice"
// rendered as maths loses its spaces (sumof7withtwodice), so word titles become \text{...}.
const MATH_WORDS = /^(sin|cos|tan|log|lim|sqrt|frac|dfrac|int|exp|ln|cases|begin|end|text|times|div|cdot|infty|circ|binom|left|right|dx|dy|to|pi|le|ge|leq|geq|neq|approx|underbrace|quad)$/i
// written without a backslash, these are still maths (sin x, dx)
const FUNCTIONS = /^(sin|cos|tan|log|ln|lim|exp|dx|dy|dt)$/i
/** The words of an exercise that is only words ("\text{How long does it take ...?}"), to show as
 * text that wraps instead of one long formula; '' when it has maths in it. */
export function wordsOnly(latex: string | undefined | null) {
  const t = titleTex(latex).trim()
  const m = /^\\text\{([^{}]*)\}$/.exec(t)
  return m ? m[1].replace(/\\([%&#$_])/g, '$1').replace(/\\textasciicircum\{\}/g, '^').trim() : ''
}

export function titleTex(about: string | undefined | null) {
  const t = String(about ?? '').trim()
  if (!t || t.includes('\\text{')) return t
  // words of two letters or more count too ("2500 g in kg", "3 L to mL"), not single letters (x, y, f)
  const words = t.replace(/\\[a-zA-Z]+/g, ' ').split(/[^a-zA-Z]+/).filter((w) => w.length >= 2)
  if (!words.some((w) => !MATH_WORDS.test(w))) return t
  // maths with words in it ("\frac{1}{2} of 30", "x^2 - 4 = 0, find x"): the maths stays maths and
  // the words become text, with their spaces ("of" is \text{ of }, not the letters o f)
  if (/\\[a-zA-Z]|[\^_{}]/.test(t.replace(/\\[%&#$_]/g, ''))) {
    return t
      .replace(/(?<!\\)%/g, '\\%')
      .replace(/(?<![\\a-zA-Z])(?<!\\(?:begin|end)\{)[a-zA-Z]{2,}(?:\s+[a-zA-Z]{2,})*(?![a-zA-Z])/g, (m) => (m.split(/\s+/).every((w) => FUNCTIONS.test(w)) ? m : `\\text{ ${m} }`))
  }
  // in \text{...}, % starts a comment and & # $ _ ^ are errors: they're written as characters
  return `\\text{${t.replace(/[{}\\]/g, '').replace(/[%&#$_]/g, '\\$&').replace(/\^/g, '\\textasciicircum{}')}}`
}
