// "What's going on": the tutor's work explained in plain words, as it happens.
import { reactive, watch } from 'vue'
import { state } from './engine'
import { STYLE_LABEL } from './mock'
import { youNote } from './sheet'
import type { TeachStyle } from './types'

export type ActivityKind = 'camera' | 'read' | 'right' | 'wrong' | 'unsure' | 'teach' | 'practice' | 'ask' | 'answer' | 'learned'

export interface Activity {
  id: number
  at: number
  kind: ActivityKind
  text: string
  detail?: string
}

export const activity = reactive({ items: [] as Activity[] })
let next = 0

export function log(kind: ActivityKind, text: string, detail?: string) {
  activity.items.unshift({ id: ++next, at: Date.now(), kind, text, detail })
  if (activity.items.length > 40) activity.items.pop()
}

let started = false

export function startActivityLog() {
  if (started) return
  started = true
  const verdicts = new Map<number, string>()
  const wins: Partial<Record<TeachStyle, number>> = {}

  watch(
    () => state.student?.id,
    () => {
      activity.items.splice(0)
      verdicts.clear()
      for (const k of Object.keys(wins)) delete wins[k as TeachStyle]
    },
  )

  watch(
    () => state.parts.map((p) => `${p.id}:${p.verdict}`).join(),
    () => {
      for (const p of state.parts) {
        if (verdicts.get(p.id) === p.verdict) continue
        verdicts.set(p.id, p.verdict)
        if (p.verdict === 'reading') log('read', `Pencil lifted. Reading line ${p.id}.`, 'Only this line is cropped from the picture and read, on this laptop.')
        else if (p.verdict === 'correct') log('right', `Exercise ${p.id} is right.`, `Read ${Math.round(p.confidence * 100)}% sure, then checked with exact arithmetic.`)
        else if (p.verdict === 'wrong') log('wrong', `Exercise ${p.id} isn't right yet.`, p.note ? youNote(p.note) : 'Checked with exact arithmetic.')
        else if (p.note === 'not finished yet') log('unsure', `Exercise ${p.id} isn't finished yet.`, 'Write the answer, then check the sheet again.')
        else log('unsure', `Glim couldn't check exercise ${p.id}.`, p.note)
      }
    },
  )

  watch(
    () => state.confirm,
    (c) => c && log('unsure', `Not sure I read line ${c.partId} right.`, 'Asking you first: it’s quicker and cheaper than asking a big model.'),
  )

  watch(
    () => state.teaching,
    (t) => t && log('teach', `Drawing it with ${STYLE_LABEL[t.style].toLowerCase()}, try ${t.iteration}.`, t.why),
  )

  watch(
    () => state.exercises.map((e) => e.id).join(),
    (ids) => ids && log('practice', `${state.exercises.length} similar exercises to try.`, 'Each is picked so the same mistake would show up as a different wrong answer.'),
  )

  watch(
    () => state.profile,
    (profile) => {
      for (const [style, v] of Object.entries(profile) as [TeachStyle, { wins: number }][]) {
        if (v.wins > (wins[style] ?? 0)) log('learned', `${STYLE_LABEL[style]} worked for ${state.student?.name ?? 'you'}.`, 'Next time, Glimpse starts with what works.')
        wins[style] = v.wins
      }
    },
  )

  watch(
    () => (state.question?.final ? state.question.text : ''),
    (text) => text && log('ask', `You asked: « ${text} »`, state.question?.pointedAt ? `You were pointing at line ${state.question.pointedAt.partId}.` : undefined),
  )

  watch(
    () => state.answer,
    (a) => a && log('answer', 'Answered your question.', a.translation ?? a.text),
  )
}
