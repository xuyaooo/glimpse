// Everything the child has done, from the database (GET /api/history): every line written (with
// the photo and the hint), every question, every worked solution and animation, and the session
// summaries. "My work" shows it, together with what is going on now.
import { computed, ref, watch } from 'vue'
import { currentSessionId, state } from './engine'
import { TOPIC, topicIcon, topicOf } from './sceneKinds'
import type { Scene, SessionReview, SessionSummary, WorkedSteps, WrittenPart } from './types'

export interface SavedRecord {
  ref: string
  sessionId: string
  kind: 'line' | 'question' | 'steps' | 'summary'
  at: number
  data: Record<string, unknown>
}
export interface SavedLine extends WrittenPart {
  saved: true
  sessionId: string
  hint: string | null
  photo: string | null
  solution: WorkedSteps | null
}

// The words of \text{...} are kept: a word problem's key is its words, never empty.
const key = (t: unknown) => String(t ?? '').replace(/\\text\{([^}]*)\}/g, '$1').replace(/\\left|\\right|[\s{}$]|=+$/g, '').toLowerCase()

/** "You …" said about a line from its note. The tutor's own notes may already start with "you" and end with a full stop or a question mark. */
export function youNote(note: string) {
  const n = note.trim().replace(/^you\s+/i, '')
  const end = /[.?!]$/.test(n) ? '' : '.'
  // a note that is already a sentence about the work ("This answer is wrong...") is not "You This..."
  if (/^(?:this|that|these|those|the|your|it|its|there|here|a|an|i|we)\b/i.test(n)) return `${n.charAt(0).toUpperCase()}${n.slice(1)}${end}`
  return `You ${n}${end}`
}

// The same mistake, worded differently from one summary to the next (the engine's misconceptions)
const MISTAKE: [RegExp, string][] = [
  [/\badd(ed|s|ing)?\b[^.]{0,30}\b(tops?|top numbers?|numerators?)\b[^.]{0,30}\band (the |their )?(bottoms?|bottom numbers?|denominators?)\b/i, 'adds_across'],
  [/\bchanged the bottoms?,? (but )?not the tops?\b/i, 'no_scaling'],
  [/\bkept one of the bottoms\b/i, 'keeps_bigger_bottom'],
  [/\bmultiplied (them )?instead of adding\b/i, 'multiplies'],
]
const mistakeKey = (what: string) => MISTAKE.find(([re]) => re.test(what))?.[1] ?? what.toLowerCase().slice(0, 40)

export function useWork() {
  const records = ref<SavedRecord[]>([])
  const loading = ref(false)
  const error = ref('')

  /** Practise again: the exercises suggested after each finished session, newest first. */
  const reviews = ref<SessionReview[]>([])
  /** The student whose work has been loaded (null until the first answer). */
  const loadedFor = ref<string | null>(null)

  async function load() {
    const id = state.student?.id
    if (!id) return
    // The scripted demo saves nothing: its Practise again is the summary of the session just finished.
    if (state.connection === 'demo') {
      const s = state.summary
      reviews.value = s?.review?.length ? [{ ref: `demo-${s.at}`, sessionId: currentSessionId(), at: s.at, title: s.title, items: s.review }] : []
      loadedFor.value = id
      return
    }
    loading.value = true
    try {
      const [r, rv] = await Promise.all([fetch(`/api/history?student=${encodeURIComponent(id)}&limit=500`), fetch(`/api/review?student=${encodeURIComponent(id)}`)])
      if (!r.ok) throw new Error(String(r.status))
      records.value = await r.json()
      if (rv.ok) reviews.value = await rv.json()
      loadedFor.value = id
      error.value = ''
    } catch {
      error.value = 'Your saved work needs the tutor engine.'
    } finally {
      loading.value = false
    }
  }

  /** "I did it" on one exercise: shown at once, saved with its session (put back if it couldn't be saved). */
  async function markDone(ref: string, id: string, done: boolean) {
    const item = reviews.value.find((r) => r.ref === ref)?.items.find((i) => i.id === id)
    if (!item) return
    const was = !!item.done
    item.done = done
    if (state.connection === 'demo') return // nothing to save it to
    try {
      const r = await fetch('/api/review/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref, id, done }) })
      if (!r.ok) throw new Error(String(r.status))
    } catch {
      item.done = was
    }
  }
  // load now, and again when something new is saved (a line read, a session ended)
  let timer = 0
  const later = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(load, 1200)
  }
  watch(() => [state.student?.id, state.connection], load, { immediate: true })
  watch(() => [state.parts.length, state.questions.length, state.summary?.at, state.steps?.at], later)

  const of = (kind: SavedRecord['kind']) => records.value.filter((r) => r.kind === kind)
  const solutions = computed(() => of('steps'))

  // the worked solution saved for a line (same session, same exercise)
  function solutionFor(r: SavedRecord): WorkedSteps | null {
    const k = key(r.data.latex)
    const s = solutions.value.find((x) => {
      const a = key(x.data.about)
      return x.sessionId === r.sessionId && !!k && !!a && (a.includes(k) || k.includes(a))
    })
    if (!s) return null
    const d = s.data as { about: string; title: string; result: string; scene: Scene | null; items: { say: string; math: string }[] }
    return { about: d.about, title: d.title, items: d.items ?? [], result: d.result, lang: state.lang, at: s.at, scene: d.scene ?? undefined }
  }

  /** Lines from earlier sessions (the session going on is shown live). Newest first. */
  const pastLines = computed<SavedLine[]>(() =>
    of('line')
      .filter((r) => r.sessionId !== currentSessionId())
      .map((r, i) => ({
        id: 100000 + i,
        latex: String(r.data.latex ?? ''),
        confidence: 0.9,
        verdict: (['correct', 'wrong', 'unsure'].includes(String(r.data.verdict)) ? r.data.verdict : 'unsure') as WrittenPart['verdict'],
        ...(r.data.note ? { note: String(r.data.note) } : {}),
        at: r.at,
        saved: true as const,
        sessionId: r.sessionId,
        hint: r.data.hint ? String(r.data.hint) : null,
        photo: r.data.photo ? String(r.data.photo) : null,
        solution: solutionFor(r),
      })),
  )

  const summaries = computed(() => of('summary').map((r) => r.data as unknown as SessionSummary).sort((a, b) => b.at - a.at))

  const stats = computed(() => {
    const lines = of('line')
    return {
      exercises: lines.length,
      right: lines.filter((r) => r.data.verdict === 'correct').length,
      questions: of('question').length,
      animations: solutions.value.filter((r) => r.data.scene).length,
      sessions: new Set(records.value.map((r) => r.sessionId)).size,
      stars: summaries.value.reduce((t, s) => t + (s.stars || 0), 0),
    }
  })

  /** What was practised, by topic: the animations recognised, and the summaries' topics merged in. */
  const topics = computed(() => {
    const count = new Map<string, number>()
    const add = (topic: string | null, n = 1) => topic && count.set(topic, (count.get(topic) ?? 0) + n)
    for (const r of solutions.value) {
      const kind = (r.data.scene as Scene | null)?.kind
      if (kind) add(TOPIC[kind])
    }
    for (const s of summaries.value) for (const p of s.practised ?? []) add(topicOf(p) ?? p.replace(/\s*\(.*\)\s*/g, '').trim())
    return [...count.entries()].map(([label, n]) => ({ label, icon: topicIcon(label), n })).sort((a, b) => b.n - a.n).slice(0, 10)
  })

  /** Mistakes to watch out for, with a tip (from the summaries; else the notes on wrong lines). */
  const mistakes = computed(() => {
    const seen = new Set<string>()
    const out: { what: string; tip: string }[] = []
    for (const s of summaries.value)
      for (const m of s.mistakes ?? []) {
        const k = mistakeKey(m.what)
        if (!seen.has(k)) {
          seen.add(k)
          out.push(m)
        }
      }
    if (!out.length)
      for (const r of of('line'))
        if (r.data.verdict === 'wrong' && r.data.note && !seen.has(mistakeKey(youNote(String(r.data.note))))) {
          seen.add(mistakeKey(youNote(String(r.data.note))))
          out.push({ what: youNote(String(r.data.note)), tip: String(r.data.hint ?? 'Watch the animation, then try a similar one.') })
        }
    return out.slice(0, 4)
  })

  const latest = computed(() => summaries.value[0] ?? null)
  return { records, loading, error, load, pastLines, stats, topics, mistakes, latest, summaries, reviews, markDone, loadedFor }
}
