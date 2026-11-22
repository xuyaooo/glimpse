// "Check my whole sheet". When the student seems to have finished (some new lines, then no
// pencil movement and no hand on the paper for a while), a prompt offers to check every exercise
// on the sheet; the engine answers with a report (server/engine/sheet.js).
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export interface SheetItem {
  n: number
  partId: number
  latex: string
  verdict: 'right' | 'wrong' | 'unfinished' | 'unsure'
  note: string | null
}
export interface SheetReport {
  total: number
  right: number
  wrong: number
  unfinished: number
  unsure: number
  items: SheetItem[]
  message: string
  firstToFix: number | null
  at: number
}

/** How long the paper must stay still (no pencil, no hand) before the prompt. */
export const SHEET_IDLE_MS = 8000
/** New lines read since the last prompt before it is offered (again). */
export const SHEET_MIN_LINES = 2

export function useSheetPrompt(opts: { moving: Ref<boolean>; handOnPaper: () => boolean; enabled: () => boolean; lines: () => number }) {
  const show = ref(false)
  let lastActivity = performance.now()
  let linesAtLastOffer = opts.lines()
  let timer = 0
  watch(opts.moving, (m) => {
    if (m) {
      lastActivity = performance.now()
      show.value = false // writing again: not finished after all
    }
  })
  function tick() {
    if (!opts.enabled()) {
      show.value = false
      return
    }
    if (opts.handOnPaper()) lastActivity = performance.now()
    if (!show.value && opts.lines() - linesAtLastOffer >= SHEET_MIN_LINES && performance.now() - lastActivity >= SHEET_IDLE_MS) show.value = true
  }
  /** The prompt was answered (check or not yet): offer again after a few more lines. */
  function answered() {
    show.value = false
    linesAtLastOffer = opts.lines()
    lastActivity = performance.now()
  }
  onMounted(() => (timer = window.setInterval(tick, 500)))
  onBeforeUnmount(() => window.clearInterval(timer))
  return { show, answered }
}

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
