// Dashboard summaries (web/src/lib/mock.ts StudentSummary) built from stored sessions.
import { listSessions } from '../store.js'
import { similarExercises } from './teach.js'
import { BUGS } from './maths.js'

const LANGUAGE = { fr: 'Français', en: 'English', de: 'Deutsch', it: 'Italiano', tr: 'Türkçe', ar: 'العربية' }
const time = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const minutes = (s) => Math.max(1, Math.round(((s.updatedAt || s.startedAt) - s.startedAt) / 60000))
const isToday = (t) => new Date(t).toDateString() === new Date().toDateString()
const when = (t) => (isToday(t) ? 'Today' : new Date(t).toLocaleDateString('en-GB', { weekday: 'long' }))
const STYLE = { pictures: 'pictures', bars: 'fraction bars', steps: 'a worked example' }

function summarize(id, sessions) {
  const [latest] = sessions // newest first
  const name = latest.name || id
  const chrono = [...sessions].reverse() // oldest first, for lists in time order
  // today's sessions (newest first): also one that started before midnight and goes on today
  const today = sessions.filter((s) => isToday(s.updatedAt || s.startedAt))
  const parts = [...today]
    .reverse()
    .flatMap((s) => s.parts.filter((p) => isToday(p.at ?? s.updatedAt ?? s.startedAt)))
    .filter((p) => p.verdict !== 'reading')
  const right = parts.filter((p) => p.verdict === 'correct').length
  // today's minutes of a session: none if nothing was written or asked today (the page opened,
  // then left), and only the time since midnight for a session that started the day before
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const activeToday = (s) => [...s.parts, ...(s.questions || [])].some((x) => isToday(x.at ?? s.updatedAt ?? s.startedAt))
  const minutesToday = (s) => (activeToday(s) ? minutes({ startedAt: Math.max(s.startedAt, dayStart), updatedAt: s.updatedAt }) : 0)

  // misconceptions over today's sessions; the status is the newest session's
  const ms = {}
  for (const s of today) {
    for (const m of Object.values(s.misconceptions || {})) {
      const x = (ms[m.id] ||= { id: m.id, name: m.name, seen: 0, status: m.status, styles: [] })
      x.seen += m.seen
      for (const st of m.styles) if (!x.styles.includes(st)) x.styles.push(st)
    }
  }
  const misconceptions = Object.values(ms)
  const profile = {}
  for (const s of sessions) {
    for (const [st, v] of Object.entries(s.profile || {})) {
      const p = (profile[st] ||= { tries: 0, wins: 0 })
      p.tries += v.tries
      p.wins += v.wins
    }
  }
  const working = misconceptions.filter((m) => m.status === 'working')
  const flag = working.some((m) => m.seen >= 2) ? 'needs' : misconceptions.some((m) => m.status === 'fixed') ? 'fixed' : 'ok'
  const worked = Object.entries(profile).find(([, v]) => v.wins > 0)?.[0]

  let headline
  if (!parts.length) headline = `${name} hasn't written anything today yet.`
  else {
    headline = `${name} wrote ${parts.length} line${parts.length === 1 ? '' : 's'}, ${right} right.`
    if (working.length) headline += ` Still working on: ${working.map((m) => m.name.toLowerCase()).join(', ')} (seen ${working.reduce((n, m) => n + m.seen, 0)} times).`
    if (worked) headline += ` ${STYLE[worked][0].toUpperCase()}${STYLE[worked].slice(1)} worked for ${name}.`
    if (flag === 'needs') headline += ` Worth sitting with ${name} for five minutes.`
  }

  const bug = BUGS.find((b) => b.id === working[0]?.id) || null
  const next = (latest.exercises?.length ? latest.exercises : similarExercises({ bug, count: 2 })).map((e) => e.latex)

  return {
    id,
    name,
    language: LANGUAGE[latest.lang] || latest.lang,
    langCode: latest.lang,
    live: !latest.ended && Date.now() - (latest.updatedAt || 0) < 10 * 60 * 1000,
    flag,
    headline,
    today: { minutes: today.reduce((n, s) => n + minutesToday(s), 0), parts: parts.length, right },
    parts: parts.slice(-20).map((p) => ({ latex: p.latex, verdict: p.verdict, ...(p.note ? { note: p.note } : {}), time: time(p.at) })),
    misconceptions,
    profile,
    next,
    questions: chrono.flatMap((s) => s.questions || []).slice(-10).map(({ text, lang, about, answer }) => ({ text, lang, about, answer })),
    sessions: sessions.slice(0, 8).map((s) => {
      const ps = s.parts.filter((p) => p.verdict !== 'reading')
      return { when: when(s.startedAt), minutes: minutes(s), parts: ps.length, right: ps.filter((p) => p.verdict === 'correct').length }
    }),
    ai: {
      // today's (the dashboard shows "AI usage today")
      localReads: today.reduce((n, s) => n + (s.ai?.localReads || 0), 0),
      bigCalls: today.reduce((n, s) => n + (s.ai?.bigCalls || 0), 0),
      cost: today.reduce((n, s) => n + (s.ai?.cost || 0), 0),
    },
  }
}

export async function studentSummaries() {
  const all = await listSessions()
  const byStudent = new Map()
  for (const s of all) {
    if (!s?.student) continue
    if (!byStudent.has(s.student)) byStudent.set(s.student, [])
    byStudent.get(s.student).push(s)
  }
  // newest first, by the sessions' own clocks (two saves can share the database's timestamp)
  const newest = (s) => s.updatedAt || s.startedAt || 0
  return [...byStudent.entries()].map(([id, sessions]) => summarize(id, sessions.sort((a, b) => newest(b) - newest(a))))
}
