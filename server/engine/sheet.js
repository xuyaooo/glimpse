// "Check my whole sheet": every exercise on the page, judged, and counted. The verdicts come
// from analyzePage (the tutor model, overruled by exact checking where the maths can be
// computed); this only counts them and words the result, the same way every time.

const SHORT = (t, n = 60) => (String(t ?? '').length > n ? `${String(t).slice(0, n - 1)}…` : String(t ?? ''))

/** A line's verdict as the report shows it: right, wrong, unfinished (started, no answer yet) or unsure. */
export function sheetVerdict(part) {
  if (part.verdict === 'correct') return 'right'
  if (part.verdict === 'wrong') return 'wrong'
  if (part.note === 'not finished yet') return 'unfinished'
  return 'unsure'
}

// "\text{a) } 34 + 25 = 59" -> "34 + 25 = 59" (the label is shown beside it)
const unlabelled = (latex) => String(latex).replace(/^\\text\{\s*\(?(?:[a-z]|\d{1,2})[).:]?\s*\}\s*/i, '') || String(latex)

/** The exercise's own label on the sheet ("a) 34 + 25 = 59" -> "a", "(3) ..." -> "3"), or null. */
export function sheetLabel(raw) {
  const m = String(raw ?? '').trim().match(/^\(?([a-z]|\d{1,2})[).:]\s+|^\(?([a-z]|\d{1,2})\)/i)
  return m ? (m[1] ?? m[2]).toLowerCase() : null
}

/**
 * The report for the parts of one sheet, top to bottom:
 * { total, right, wrong, unfinished, unsure, items: [{ n, label, partId, latex, verdict, note }], message, firstToFix, at }.
 */
export function sheetReport(parts, { name } = {}) {
  const items = parts
    .filter((p) => p && p.verdict !== 'reading' && p.latex)
    .map((p, i) => ({ n: i + 1, label: sheetLabel(p.raw), partId: p.id, latex: unlabelled(p.latex), verdict: sheetVerdict(p), note: p.note && p.note !== 'not finished yet' ? SHORT(p.note, 120) : null }))
  const count = (v) => items.filter((x) => x.verdict === v).length
  const [right, wrong, unfinished, unsure] = ['right', 'wrong', 'unfinished', 'unsure'].map(count)
  const total = items.length
  const first = items.find((x) => x.verdict === 'wrong') ?? items.find((x) => x.verdict === 'unfinished') ?? null
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  let message
  if (!total) message = "I couldn't find any exercise on this sheet. Hold it flat under the camera and try again."
  else if (right === total) message = `${total === 1 ? 'Your exercise is' : `All ${total} exercises are`} right. Brilliant${name ? `, ${name}` : ''}!`
  else {
    const parts = [`${right} of ${total} right`]
    if (wrong) parts.push(`${wrong} to fix`)
    if (unfinished) parts.push(`${plural(unfinished, 'exercise')} not finished`)
    if (unsure) parts.push(`${unsure} I couldn't check`)
    // by the sheet's own label when it has one ("Start with b."), else by its place
    const which = first && (first.label && /[a-z]/.test(first.label) ? first.label : `number ${first.label ?? first.n}`)
    message = `${parts.join(', ')}.${first ? ` Start with ${which}.` : ''}`
  }
  return { total, right, wrong, unfinished, unsure, items, message, firstToFix: first?.partId ?? null, at: Date.now() }
}
