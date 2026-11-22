// "Check my whole sheet": the engine judges every exercise on the page and answers with a report
// (server/engine/sheet.js). Without an engine (the demo), the lines on screen are counted here.

import type { SheetItem, SheetReport } from './types'
export type { SheetItem, SheetReport }

/** The report for the demo (no engine): the lines on screen, counted the same way as the engine. */
export function localSheetReport(parts: { id: number; latex: string; verdict: string; note?: string }[], name?: string): SheetReport {
  const items: SheetItem[] = parts
    .filter((p) => p.verdict !== 'reading' && p.latex)
    .map((p, i) => ({
      n: i + 1,
      partId: p.id,
      latex: p.latex,
      verdict: p.verdict === 'correct' ? 'right' : p.verdict === 'wrong' ? 'wrong' : p.note === 'not finished yet' ? 'unfinished' : 'unsure',
      note: p.note && p.note !== 'not finished yet' ? p.note : null,
    }))
  const count = (v: SheetItem['verdict']) => items.filter((x) => x.verdict === v).length
  const [right, wrong, unfinished, unsure] = (['right', 'wrong', 'unfinished', 'unsure'] as const).map(count)
  const total = items.length
  const first = items.find((x) => x.verdict === 'wrong') ?? items.find((x) => x.verdict === 'unfinished') ?? null
  const bits = [`${right} of ${total} right`]
  if (wrong) bits.push(`${wrong} to fix`)
  if (unfinished) bits.push(`${unfinished} not finished`)
  if (unsure) bits.push(`${unsure} I couldn't check`)
  const message = !total
    ? "I couldn't find any exercise on this sheet."
    : right === total
      ? `${total === 1 ? 'Your exercise is' : `All ${total} exercises are`} right. Brilliant${name ? `, ${name}` : ''}!`
      : `${bits.join(', ')}.${first ? ` Start with number ${first.n}.` : ''}`
  return { total, right, wrong, unfinished, unsure, items, message, firstToFix: first?.partId ?? null, at: Date.now() }
}
