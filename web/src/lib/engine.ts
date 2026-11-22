// The app's single source of truth for a session, fed by the engine over a WebSocket.
// If no engine answers within 1.5 s (or the URL has ?demo), a scripted demo engine takes over.

import { reactive, watch } from 'vue'
import { createDemo } from './demo'
import { settings } from './settings'
import { students, type Student } from './mock'
import type { SubjectId } from './subjects'
import { localSheetReport } from './sheet'
import type { SheetReport } from './types'
import type {
  Answer,
  ClientEvent,
  Connection,
  EngineEvent,
  EngineState,
  Exercise,
  Hint,
  PageText,
  SessionSummary,
  WorkedSteps,
  Profile,
  Question,
  Teaching,
  WrittenPart,
} from './types'

/** MJPEG stream served by the engine (proxied by Vite in development). */
export const VIDEO_URL = '/video.mjpg'

/**
 * The language Glim speaks: English for everyone by default. Set VITE_TUTOR_LANG=student to use
 * each child's own language (Amara French, Luca Italian...), or a code like fr for everyone.
 */
const TUTOR_LANG: string = import.meta.env.VITE_TUTOR_LANG || 'en'

export const state = reactive({
  connection: 'connecting' as Connection,
  /** True when the engine streams a real camera. Otherwise the drawn paper stands in. */
  camera: false,
  status: 'idle' as EngineState,

  student: null as Student | null,
  /** Before a session starts too (the speech model is got ready for it). */
  lang: TUTOR_LANG === 'student' ? 'fr' : TUTOR_LANG,
  /** What the child is practising, picked on the desk. */
  subject: 'maths' as SubjectId,
  startedAt: 0,

  /** Loop 1: what the child wrote, checked. */
  parts: [] as WrittenPart[],
  confirm: null as { partId: number; latex: string } | null,
  teaching: null as Teaching | null,
  activeStep: 0,
  teachings: [] as Teaching[],
  exercises: [] as Exercise[],
  currentExerciseId: null as string | null,
  profile: {} as Profile,
  hint: null as Hint | null,
  /** The tip given for each line, so past exercises keep their reasoning. */
  hintsByPart: {} as Record<number, Hint>,

  /** The whole paper, as the OCR model last read it. */
  page: null as PageText | null,
  /** The latest whole solution, step by step. */
  steps: null as WorkedSteps | null,
  /** How the session went, once it has ended. */
  summary: null as SessionSummary | null,
  /**
   * End session was pressed: the engine takes no new work in this session (409). A new line or
   * question starts a new session for the same child first (see fresh()).
   */
  ended: false,
  /** What kind of maths the child is doing, as recognised (null: nothing read yet). */
  topic: null as { kind: string; label: string } | null,
  /** The last "Check my whole sheet" report, and whether one is being made. */
  sheet: null as SheetReport | null,
  sheetChecking: false,

  /** Loop 2: pointing and asking. */
  asking: false,
  question: null as Question | null,
  answer: null as Answer | null,
  questions: [] as { question: Question; answer: Answer }[],
})

let socket: WebSocket | null = null
let demo: ReturnType<typeof createDemo> | null = null
let queued: ClientEvent[] = []

// HTTP transport (hackathon engine, server/app.js): each event is a POST to /api/engine and
// the engine's replies stream back as NDJSON. Works on serverless hosting (Vercel), where a
// WebSocket can't stay open; the session lives in the engine's database between requests.
let http = false
let sessionId = ''
let chain: Promise<void> = Promise.resolve()
/** The line the engine's last 'part' was about, in the reply being read: a hint after it is about it. */
let hintPart: number | null = null

/** The id of the session going on (its records are saved under it). */
export const currentSessionId = () => sessionId

const newSessionId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^\w-]/g, '')

/** The engine answered with an error (a crash, or a timeout on a long read): it is still there. */
class EngineError extends Error {
  status: number
  constructor(status: number) {
    super(`engine ${status}`)
    this.status = status
  }
}

// `sid`: the session the event belongs to. A reply for a session that has since been replaced
// (another child, "Start a new session") is read to the end but changes nothing on screen.
async function postEvent(e: ClientEvent, sid: string) {
  const r = await fetch('/api/engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sid, event: e }),
  })
  if (!r.ok || !r.body) throw new EngineError(r.status)
  if (sid === sessionId && state.connection === 'offline') state.connection = 'live'
  if (sid === sessionId) hintPart = null
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line && sid === sessionId) apply(JSON.parse(line) as EngineEvent)
    }
  }
}

// What the child hears when the engine can't be reached or fails (the reason is logged).
const NO_ENGINE: Hint = { text: "I couldn't reach the tutor just now. Please try again in a moment.", lang: 'en' }
// The engine refused new work because the session has ended (409: finished in another tab).
const ENDED: Hint = { text: 'That session has finished. Try again and a new one starts.', lang: 'en' }

// The engine stopped (nothing answers): "The tutor stopped" shows until it answers again.
let probing = false
function waitForEngine() {
  if (probing) return
  probing = true
  const again = () =>
    window.setTimeout(() => {
      fetch('/api/engine/hello')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((hello: EngineEvent | null) => {
          if (hello?.type !== 'hello') return again()
          probing = false
          if (state.connection === 'offline') state.connection = 'live'
        })
    }, 3000)
  again()
}

// The session going on in this tab and its student, kept over a reload: { id, student }.
const SAVED_SESSION = 'glimpse.session'

function sendHttp(e: ClientEvent) {
  if (e.type === 'session_start' || !sessionId) {
    sessionId = newSessionId()
    try {
      if (e.type === 'session_start') sessionStorage.setItem(SAVED_SESSION, JSON.stringify({ id: sessionId, student: e.student }))
    } catch {
      // private mode: fine, a reload starts again
    }
  }
  // One event at a time, in order (a slow read finishes before the next event is sent). Each
  // goes to the session it was sent in, even if a new session starts while it waits.
  const sid = sessionId
  chain = chain
    .then(() => postEvent(e, sid))
    .catch((err) => {
      console.warn('Glimpse: engine request failed', err)
      if (sid !== sessionId) return
      state.asking = false
      apply({ type: 'status', state: 'watching' })
      if (!(err instanceof EngineError)) {
        state.connection = 'offline'
        waitForEngine()
      }
      // Tell the child, instead of dropping the line or the question without a word.
      if (e.type === 'session_end') state.summary ??= localSummary()
      else if (e.type !== 'set_age' && e.type !== 'subject') {
        hintPart = null
        // the next line or question starts a new session (fresh())
        if (err instanceof EngineError && err.status === 409) state.ended = true
        apply({ type: 'hint', hint: state.ended ? ENDED : NO_ENGINE })
      }
    })
}

function apply(e: EngineEvent) {
  switch (e.type) {
    case 'hello':
      state.connection = 'live'
      state.camera = e.camera
      flush()
      break
    case 'status':
      state.status = e.state
      break
    case 'part': {
      const i = state.parts.findIndex((p) => p.id === e.part.id)
      if (i >= 0) state.parts[i] = e.part
      else state.parts.push(e.part)
      hintPart = e.part.id
      break
    }
    case 'confirm':
      state.confirm = { partId: e.partId, latex: e.latex }
      break
    case 'teach':
      state.teaching = e.teaching
      state.activeStep = 0
      if (e.teaching) {
        state.answer = null
        state.teachings.push(e.teaching)
      }
      break
    case 'exercises':
      state.exercises = e.items
      state.currentExerciseId = e.currentId ?? e.items[0]?.id ?? null
      break
    case 'profile':
      state.profile = e.profile
      break
    case 'hint': {
      state.hint = e.hint
      // Only feedback on a line is kept with it ("I can't see a new line yet" is not about one).
      if (e.hint && hintPart !== null) state.hintsByPart[hintPart] = e.hint
      break
    }
    case 'question':
      state.question = e.question
      break
    case 'page':
      state.page = e.page
      break
    case 'steps':
      state.steps = e.steps
      break
    case 'summary':
      state.summary = e.summary
      break
    case 'topic':
      state.topic = e.topic
      break
    case 'sheet':
      state.sheet = e.sheet ?? null
      state.sheetChecking = false
      break
    case 'answer':
      state.answer = e.answer
      state.asking = false
      if (state.question) state.questions.push({ question: { ...state.question, final: true }, answer: e.answer })
      break
  }
}

function flush() {
  const pending = queued
  queued = []
  pending.forEach(send)
}

function startDemo() {
  if (demo) return
  socket = null
  state.connection = 'demo'
  state.camera = false
  demo = createDemo(apply)
  flush()
}

export function connect() {
  if (socket || demo || http) return
  if (new URLSearchParams(location.search).has('demo')) return startDemo()

  // 1. The hackathon engine over HTTP; 2. otherwise an engine on a WebSocket; 3. otherwise demo.
  // A server that is starting up (a cold deploy) can take a few seconds: hello is tried twice.
  hello(1500, () => hello(7000, connectSocket))
}

function hello(ms: number, fail: () => void) {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), ms)
  fetch('/api/engine/hello', { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`hello ${r.status}`))))
    .then((h: EngineEvent) => {
      window.clearTimeout(timer)
      if (h?.type !== 'hello') throw new Error('not an engine')
      http = true
      apply(h)
    })
    .catch(() => {
      window.clearTimeout(timer)
      if (!http) fail()
    })
}

function connectSocket() {
  const url = import.meta.env.VITE_ENGINE_WS ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  try {
    socket = new WebSocket(url)
  } catch {
    return startDemo()
  }
  const giveUp = window.setTimeout(() => {
    if (state.connection !== 'live') {
      socket?.close()
      startDemo()
    }
  }, 1500)
  socket.onmessage = (m) => {
    window.clearTimeout(giveUp)
    try {
      apply(JSON.parse(m.data) as EngineEvent)
    } catch (err) {
      console.warn('Glimpse: bad engine message', err)
    }
  }
  socket.onerror = () => {
    window.clearTimeout(giveUp)
    if (state.connection !== 'live') startDemo()
  }
  socket.onclose = () => {
    if (state.connection === 'live') state.connection = 'offline'
  }
}

function send(e: ClientEvent) {
  if (!http && e.type === 'cut_part') hintPart = null // a new read: its hint comes after its line
  if (demo) return demo.handle(e)
  if (state.connection === 'connecting') return void queued.push(e)
  if (http) return sendHttp(e)
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(e))
}

function clearSession() {
  Object.assign(state, {
    parts: [],
    confirm: null,
    teaching: null,
    activeStep: 0,
    teachings: [],
    exercises: [],
    currentExerciseId: null,
    profile: {},
    hint: null,
    hintsByPart: {},
    asking: false,
    question: null,
    answer: null,
    questions: [],
    page: null,
    steps: null,
    summary: null,
    ended: false,
    topic: null,
    sheet: null,
    sheetChecking: false,
  })
}

/**
 * A summary counted in the browser, for when the engine can't write one (demo mode, or no
 * answer): the lines, what was right, the questions.
 */
export function localSummary(): SessionSummary {
  const lines = state.parts.filter((p) => p.verdict !== 'reading')
  const right = lines.filter((p) => p.verdict === 'correct').length
  const wrong = lines.filter((p) => p.verdict === 'wrong').length
  const q = state.questions.length
  const done = lines.length + q
  return {
    title: !done ? 'Thanks for coming by!' : right && right === lines.length ? 'Everything right today!' : 'Good work today!',
    praise: done ? `You wrote ${lines.length} line${lines.length === 1 ? '' : 's'}${lines.length ? ` and got ${right} right` : ''}${q ? `, and asked ${q} question${q === 1 ? '' : 's'}` : ''}.` : 'Next time, write a line or point at an exercise and ask me.',
    practised: done ? [state.topic?.label ?? (state.connection === 'demo' ? 'Adding fractions' : 'Maths')] : [],
    // the same mistake made twice is listed once
    mistakes: [...new Set(lines.filter((p) => p.verdict === 'wrong' && p.note).map((p) => p.note!))].slice(-2).map((note) => ({ what: `You ${note}.`, tip: 'Watch the explanation again, then try a similar one.' })),
    next: wrong ? 'Try a similar exercise, and check each step.' : 'Try one more exercise on your paper.',
    for_adults: `${state.student?.name ?? 'The student'} wrote ${lines.length} line${lines.length === 1 ? '' : 's'} (${right} right, ${wrong} not yet) and asked ${q} question${q === 1 ? '' : 's'}.`,
    minutes: Math.max(1, Math.round((Date.now() - state.startedAt) / 60000)),
    lines: lines.length,
    right,
    wrong,
    questions: q,
    stars: !done ? 1 : Math.min(3, 1 + (done >= 3 ? 1 : 0) + (lines.length && right / lines.length >= 0.6 ? 1 : 0)),
    lang: state.lang,
    name: state.student?.name,
    at: Date.now(),
    // to practise: the lines that went wrong or weren't finished, again (the engine's own summary
    // adds new numbers and checked answers)
    review: lines
      .filter((p) => p.verdict === 'wrong' || p.verdict === 'unsure')
      .slice(-3)
      .reverse()
      .map((p) => ({
        id: `line-${p.id}`,
        exercise: withoutAnswer(p.latex),
        level: 'again' as const,
        why: p.verdict === 'wrong' ? 'You got a different answer on this one. Try it again, one step at a time.' : "You didn't finish this one. Try it all the way to the answer.",
        kind: null,
        answer: null,
        scene: null,
      })),
  }
}

// "\frac{1}{2} + \frac{1}{3} = \frac{2}{5}" -> the sum alone; an equation (a letter after the "=") stays whole
function withoutAnswer(latex: string) {
  const i = latex.lastIndexOf('=')
  if (i < 0) return latex
  const right = latex.slice(i + 1)
  const left = latex.slice(0, i).trim()
  return left && !/[a-zA-Z]/.test(right.replace(/\\[a-zA-Z]+/g, ' ')) && !/[a-zA-Z]/.test(left.replace(/\\[a-zA-Z]+/g, ' ')) ? left : latex
}

/** The topic to show: what was recognised on the paper, not a fixed one. */
export function topicLabel(fallback: string) {
  if (state.connection === 'demo') return fallback // the scripted demo is about fractions
  return state.topic?.label ?? 'Any exercise'
}

// A new age in Settings applies to the session going on (how animations look, how Glim talks).
watch(
  () => settings.age,
  (age) => state.student && send({ type: 'set_age', age: age || state.student.age }),
)

export function startSession(studentId: string) {
  const s = students.find((x) => x.id === studentId)
  if (!s) return
  clearSession()
  state.student = s
  state.lang = TUTOR_LANG === 'student' ? s.lang : TUTOR_LANG
  state.startedAt = Date.now()
  send({ type: 'session_start', student: s.id, name: s.name, lang: state.lang, subject: state.subject, age: settings.age || s.age })
}

/**
 * A reload in the middle of a session (on the camera, on My work): the same child carries on in
 * the same session, with its lines back from the engine's history. A session that has ended, or
 * has no line yet, makes way for a new one for the same child. Not in the scripted demo.
 */
function resumeSession() {
  const query = new URLSearchParams(location.search)
  if (query.has('demo')) return
  let saved: { id?: unknown; student?: unknown } | null = null
  try {
    saved = JSON.parse(sessionStorage.getItem(SAVED_SESSION) ?? 'null')
  } catch {
    return // private mode, or an older value (just the id)
  }
  const s = students.find((x) => x.id === saved?.student)
  const id = typeof saved?.id === 'string' ? saved.id : ''
  if (!s || !id || (query.has('student') && query.get('student') !== s.id)) return
  state.student = s
  state.lang = TUTOR_LANG === 'student' ? s.lang : TUTOR_LANG
  state.startedAt = Date.now()
  sessionId = id
  fetch(`/api/history/sessions/${encodeURIComponent(id)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`history ${r.status}`))))
    .then((records: { kind: string; at: number; data: Record<string, unknown> }[]) => {
      if (sessionId !== id) return // another session started meanwhile
      const lines = new Map<number, { at: number; data: Record<string, unknown> }>()
      for (const r of records) if (r.kind === 'line' && Number.isInteger(r.data?.partId)) lines.set(r.data.partId as number, r)
      if (!lines.size || records.some((r) => r.kind === 'summary')) return startSession(s.id)
      if (state.status === 'idle') state.status = 'watching' // as the engine left it, ready for the next line
      for (const [partId, { at, data }] of [...lines].sort((a, b) => a[0] - b[0])) {
        const verdict = ['correct', 'wrong', 'unsure'].includes(String(data.verdict)) ? (data.verdict as WrittenPart['verdict']) : 'unsure'
        state.parts.push({ id: partId, latex: String(data.latex ?? ''), confidence: 0.9, verdict, ...(data.note ? { note: String(data.note) } : {}), at, ...(data.photo ? { crop: String(data.photo) } : {}) })
        if (data.hint) state.hintsByPart[partId] = { text: String(data.hint), lang: state.lang }
      }
    })
    .catch((err) => {
      console.warn('Glimpse: the session could not be resumed', err)
      if (sessionId === id) startSession(s.id)
    })
}
resumeSession()

/**
 * After End session the engine refuses new work in that session (409, and the child would hear
 * "I couldn't reach the tutor"): new work goes into a new session for the same child.
 */
function fresh() {
  if (state.ended && state.student) startSession(state.student.id)
}

/** "Choose a practice": the tutor checks this subject from now on. */
export function chooseSubject(subject: SubjectId) {
  if (subject === state.subject) return
  state.subject = subject
  state.topic = null // what was recognised belongs to the other subject
  if (state.student) send({ type: 'subject', subject })
}

/** "Check my whole sheet": every exercise on the page. The demo counts the lines on screen. */
export function checkSheet(image?: string) {
  if (!state.student || state.sheetChecking) return
  if (state.connection !== 'live') {
    state.sheet = localSheetReport(state.parts, state.student.name)
    return
  }
  fresh()
  state.sheet = null
  state.sheetChecking = true
  send({ type: 'check_sheet', image })
}

/** "Show me how" on one exercise of the sheet report: its worked solution and animation. */
export function explainPart(partId: number) {
  if (state.connection === 'live' && state.student) send({ type: 'explain', partId })
}

/** "This line is finished": the "Done writing?" prompt, a key, the mouse button or the on-screen button. */
export function cutPart(image?: string) {
  if (state.asking || state.confirm || !state.student) return
  fresh()
  send({ type: 'cut_part', image })
}

export function askStart() {
  if (state.asking || !state.student) return
  fresh()
  state.asking = true
  state.question = null
  state.answer = null
  send({ type: 'ask_start' })
}

export function askEnd() {
  if (!state.asking) return
  send({ type: 'ask_end' })
}

/**
 * "What about this?": the child points at the paper (and maybe typed a question). The engine
 * reads the whole frame with the OCR model, then the tutor gets the photo, the text and the question.
 */
export function pointAt(image: string, tip?: { x: number; y: number } | null, text = '') {
  if (!state.student) return
  fresh()
  state.asking = true
  state.answer = null
  state.question = { text: text || '…', lang: state.lang, final: false }
  send({ type: 'point', image, ...(tip ? { x: tip.x, y: tip.y } : {}), ...(text ? { text } : {}) })
}

/** The microphone is on: the question bubble shows what is heard so far. */
export function beginListening() {
  state.asking = true
  state.answer = null
  state.status = 'listening'
  state.question = { text: '', lang: state.lang, final: false }
}
export function setDraftQuestion(text: string) {
  if (state.question && !state.question.final) state.question = { ...state.question, text }
}

export function confirmReply(ok: boolean) {
  if (!state.confirm) return
  send({ type: 'confirm_reply', partId: state.confirm.partId, ok })
  state.confirm = null
}

export function pickExercise(id: string) {
  state.currentExerciseId = id
  send({ type: 'pick_exercise', id })
}

export function nextStep() {
  if (state.teaching && state.activeStep < state.teaching.steps.length - 1) state.activeStep++
}

export function dismissAnswer() {
  state.answer = null
  state.question = null
}

export function endSession() {
  state.ended = true
  send({ type: 'session_end' })
}
