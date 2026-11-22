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

/**
 * The report for the parts of one sheet, top to bottom:
 * { total, right, wrong, unfinished, unsure, items: [{ n, partId, latex, verdict, note }], message, firstToFix, at }.
 */
export function sheetReport(parts, { name } = {}) {
  const items = parts
    .filter((p) => p && p.verdict !== 'reading' && p.latex)
    .map((p, i) => ({ n: i + 1, partId: p.id, latex: p.latex, verdict: sheetVerdict(p), note: p.note && p.note !== 'not finished yet' ? SHORT(p.note, 120) : null }))
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
    message = `${parts.join(', ')}.${first ? ` Start with number ${first.n}.` : ''}`
  }
  return { total, right, wrong, unfinished, unsure, items, message, firstToFix: first?.partId ?? null, at: Date.now() }
}
