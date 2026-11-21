// The app's single source of truth for a session, fed by the engine over a WebSocket.
// If no engine answers within 1.5 s (or the URL has ?demo), a scripted demo engine takes over.

import { reactive } from 'vue'
import { createDemo } from './demo'
import { students, type Student } from './mock'
import type { SubjectId } from './subjects'
import type {
  Answer,
  ClientEvent,
  Connection,
  EngineEvent,
  EngineState,
  Exercise,
  Hint,
  Profile,
  Question,
  Teaching,
  WrittenPart,
} from './types'

/** MJPEG stream served by the engine (proxied by Vite in development). */
export const VIDEO_URL = '/video.mjpg'

export const state = reactive({
  connection: 'connecting' as Connection,
  /** True when the engine streams a real camera. Otherwise the drawn paper stands in. */
  camera: false,
  status: 'idle' as EngineState,

  student: null as Student | null,
  lang: 'fr',
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

  /** Loop 2: pointing and asking. */
  asking: false,
  question: null as Question | null,
  answer: null as Answer | null,
  questions: [] as { question: Question; answer: Answer }[],
})

let socket: WebSocket | null = null
let demo: ReturnType<typeof createDemo> | null = null
let queued: ClientEvent[] = []

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
      const last = state.parts[state.parts.length - 1]
      if (e.hint && last) state.hintsByPart[last.id] = e.hint
      break
    }
    case 'question':
      state.question = e.question
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
  if (socket || demo) return
  if (new URLSearchParams(location.search).has('demo')) return startDemo()

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
  if (demo) return demo.handle(e)
  if (state.connection === 'connecting') return void queued.push(e)
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
  })
}

export function startSession(studentId: string) {
  const s = students.find((x) => x.id === studentId)
  if (!s) return
  clearSession()
  state.student = s
  state.lang = s.lang
  state.startedAt = Date.now()
  send({ type: 'session_start', student: s.id, name: s.name, lang: s.lang, subject: state.subject })
}

/** "Choose a practice": the tutor checks this subject from now on. */
export function chooseSubject(subject: SubjectId) {
  if (subject === state.subject) return
  state.subject = subject
  if (state.student) send({ type: 'subject', subject })
}

/** "This line is finished": the pencil lifted, a key, the mouse button or the on-screen button. */
export function cutPart(image?: string) {
  if (state.asking || state.confirm || !state.student) return
  send({ type: 'cut_part', image })
}

export function askStart() {
  if (state.asking || !state.student) return
  state.asking = true
  state.question = null
  state.answer = null
  send({ type: 'ask_start' })
}

export function askEnd() {
  if (!state.asking) return
  send({ type: 'ask_end' })
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
  send({ type: 'session_end' })
}
