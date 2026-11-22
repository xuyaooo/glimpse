// Builds the dashboard's student summaries. With a live engine they come from GET /api/students;
// in demo mode the current child's summary is built from this browser's session, the rest is sample data.

import { state } from './engine'
import { sampleSummaries, STYLE_LABEL, type StudentSummary } from './mock'
import type { TeachStyle } from './types'

/**
 * A summary's "next" without its own "Next time," (it is shown after a "Next time:" label). New
 * summaries come without it; ones saved before still start with it.
 */
export function nextTip(next: string | undefined | null) {
  const t = String(next ?? '').replace(/^\s*(?:next time|la prochaine fois|nächstes mal|la prossima volta)\s*[,:]?\s*/i, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

export function liveSummary(): StudentSummary | null {
  const s = state.student
  if (!s || state.parts.length === 0) return null

  const right = state.parts.filter((p) => p.verdict === 'correct').length
  const minutes = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000))

  // One entry per misconception, with the styles used to teach it and whether it got fixed.
  const byId = new Map<string, StudentSummary['misconceptions'][number]>()
  for (const t of state.teachings) {
    const m = byId.get(t.misconception.id) ?? { id: t.misconception.id, name: t.misconception.name, seen: 0, status: 'working' as const, styles: [] as TeachStyle[] }
    m.seen++
    if (!m.styles.includes(t.style)) m.styles.push(t.style)
    const later = state.parts.filter((p) => p.id > t.partId && p.exerciseId)
    m.status = later.length > 0 && later[later.length - 1].verdict === 'correct' ? 'fixed' : 'working'
    byId.set(m.id, m)
  }
  const misconceptions = [...byId.values()]

  const won = (Object.entries(state.profile) as [TeachStyle, { tries: number; wins: number }][]).filter(([, v]) => v.wins > 0)
  const failed = (Object.entries(state.profile) as [TeachStyle, { tries: number; wins: number }][]).filter(([, v]) => v.wins === 0 && v.tries > 0)

  let headline = `${s.name} wrote ${state.parts.length} ${state.parts.length === 1 ? 'line' : 'lines'}, ${right} right.`
  for (const m of misconceptions) headline += ` Found: ${m.name}, ${m.seen === 1 ? 'once' : `${m.seen} times`}.`
  if (won.length) {
    headline += ` It clicked with ${STYLE_LABEL[won[0][0]].toLowerCase()}`
    headline += failed.length ? ` after ${failed.map(([k]) => STYLE_LABEL[k].toLowerCase()).join(' and ')} didn't.` : '.'
  } else if (misconceptions.some((m) => m.status === 'working')) {
    headline += ' Still working on it.'
  }

  const sample = sampleSummaries.find((x) => x.id === s.id)
  return {
    id: s.id,
    name: s.name,
    language: s.language,
    langCode: s.lang,
    live: true,
    flag: misconceptions.some((m) => m.status === 'working' && m.seen >= 2) ? 'needs' : misconceptions.length ? 'fixed' : 'ok',
    headline,
    today: { minutes, parts: state.parts.length, right },
    parts: state.parts.map((p) => ({ latex: p.latex, verdict: p.verdict, note: p.note, time: clock(p.at) })),
    misconceptions,
    profile: state.profile,
    next: state.exercises.map((e) => e.latex),
    questions: state.questions.map(({ question, answer }) => ({
      text: question.text,
      lang: question.lang,
      about: state.parts.find((p) => p.id === question.pointedAt?.partId)?.latex,
      answer: answer.translation ?? answer.text,
    })),
    sessions: [{ when: 'Today', minutes, parts: state.parts.length, right }, ...(sample?.sessions ?? [])],
    ai: { localReads: state.parts.length, bigCalls: 0, cost: 0 },
  }
}

export function localSummaries(): StudentSummary[] {
  const live = liveSummary()
  return live ? [live, ...sampleSummaries.filter((x) => x.id !== live.id)] : sampleSummaries
}
