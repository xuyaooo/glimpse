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

export const frac = (n: number, d: number) => `\\frac{${n}}{${d}}`
export const sum = (a: [number, number], b: [number, number], ans?: [number, number]) => `${frac(...a)}+${frac(...b)}${ans ? `=${frac(...ans)}` : ''}`
