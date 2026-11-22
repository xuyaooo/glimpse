// Tiny helpers for the reader's LaTeX subset.

export type Token = { kind: 'frac'; n: string; d: string } | { kind: 'text'; v: string }

const FRAC = /\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g

/** Split into fractions and everything else, e.g. to draw a part as handwriting in demo mode. */
export function tokens(latex: string): Token[] {
  const out: Token[] = []
  const pushText = (s: string) => {
    for (const piece of s.replace(/\\times/g, '×').replace(/\\div/g, '÷').split(/\s+/)) if (piece) out.push({ kind: 'text', v: piece })
  }
  let last = 0
  for (const m of latex.matchAll(FRAC)) {
    pushText(latex.slice(last, m.index))
    out.push({ kind: 'frac', n: m[1], d: m[2] })
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
export function titleTex(about: string | undefined | null) {
  const t = String(about ?? '').trim()
  if (!t || t.includes('\\text{')) return t
  const words = t.replace(/\\[a-zA-Z]+/g, ' ').match(/[a-zA-Z]{3,}/g) ?? []
  return words.some((w) => !MATH_WORDS.test(w)) ? `\\text{${t.replace(/[{}\\]/g, '')}}` : t
}
