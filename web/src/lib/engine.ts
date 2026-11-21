// The app's single source of truth for a tutoring session, fed by the engine over a WebSocket.
// If no engine answers within 1.5 s (or the URL has ?demo), a scripted demo engine takes over.

import { reactive } from 'vue'
import { createDemo } from './demo'
import { students, type Student } from './mock'
import type {
  Ask,
  CheckId,
  ClientEvent,
  Connection,
  EngineEvent,
  EngineState,
  Explanation,
  Frac,
  Hint,
  Insight,
  Mark,
  Problem,
  SetupCheck,
} from './types'

const DEMO_SETUP: Record<CheckId, SetupCheck> = {
  camera: { ok: true, detail: 'MX Brio found. Focus, exposure and white balance are locked.' },
  markers: { ok: true, detail: 'All 4 corner markers seen. The page is flat.' },
  light: { ok: false, detail: 'A shadow on the left side. Turn the lamp toward the paper.' },
  button: { ok: null, detail: 'Press the thumb button once.' },
  mic: { ok: true, detail: 'Microphone is on.' },
}

export const state = reactive({
  connection: 'connecting' as Connection,
  /** True when the engine streams a real camera. Otherwise the drawn worksheet stands in. */
  camera: false,
  status: 'idle' as EngineState,
  setup: { ...DEMO_SETUP } as Record<CheckId, SetupCheck>,

  student: null as Student | null,
  worksheet: 'fractions-1',
  lang: 'fr',
  startedAt: 0,

  problems: [] as Problem[],
  written: {} as Record<number, Frac>,
  marks: {} as Record<number, Mark>,
  current: 1,

  explanation: null as Explanation | null,
  activeStep: 0,
  hint: null as Hint | null,
  confirm: null as { problem: number; guess: Frac } | null,
  asking: false,
  ask: null as Ask | null,
  insight: null as Insight | null,
})

/** MJPEG stream served by the engine (proxied by Vite in development). */
export const VIDEO_URL = '/video.mjpg'

let socket: WebSocket | null = null
let demo: ReturnType<typeof createDemo> | null = null

function apply(e: EngineEvent) {
  switch (e.type) {
    case 'hello':
      state.connection = 'live'
      state.camera = e.camera
      break
    case 'status':
      state.status = e.state
      break
    case 'setup':
      Object.assign(state.setup, e.checks)
      break
    case 'worksheet':
      state.worksheet = e.id
      state.problems = e.problems
      state.written = {}
      state.marks = {}
      state.explanation = null
      state.hint = null
      state.confirm = null
      state.insight = null
      state.current = 1
      break
    case 'written':
      state.written[e.problem] = e.answer
      break
    case 'mark':
      state.marks[e.mark.problem] = e.mark
      break
    case 'explain':
      state.explanation = e.explanation
      state.activeStep = 0
      break
    case 'hint':
      state.hint = e.hint
      break
    case 'confirm':
      state.confirm = { problem: e.problem, guess: e.guess }
      break
    case 'transcript':
      state.ask = e.ask
      break
    case 'answer':
      if (e.explanation) {
        state.explanation = e.explanation
        state.activeStep = 0
      }
      state.hint = e.hint
      state.asking = false
      break
    case 'insight':
      state.insight = e.insight
      break
    case 'progress':
      state.current = e.current
      break
  }
}

function startDemo() {
  if (demo) return
  socket = null
  state.connection = 'demo'
  state.setup = { ...DEMO_SETUP }
  demo = createDemo(apply)
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
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(e))
}

export function selectStudent(id: string) {
  const s = students.find((x) => x.id === id)
  if (!s) return
  state.student = s
  state.lang = s.lang
  state.worksheet = s.topic === 'Equations' ? 'equations-1' : 'fractions-1'
}

export function startSession() {
  if (!state.student) return
  state.startedAt = Date.now()
  state.ask = null
  state.asking = false
  send({ type: 'session_start', student: state.student.id, worksheet: state.worksheet, lang: state.lang })
}

export function check() {
  if (state.asking || state.confirm) return
  send({ type: 'check' })
}

export function askStart() {
  if (state.asking) return
  state.asking = true
  state.ask = null
  send({ type: 'ask_start' })
}

export function askEnd() {
  if (!state.asking) return
  send({ type: 'ask_end' })
}

export function confirmReply(ok: boolean) {
  if (!state.confirm) return
  send({ type: 'confirm_reply', problem: state.confirm.problem, ok })
  state.confirm = null
}

export function nextStep() {
  if (state.explanation && state.activeStep < state.explanation.steps.length - 1) state.activeStep++
}

export function endSession() {
  send({ type: 'session_end' })
}

/** For the setup screen: the mouse button counts as tested once it is pressed. */
export function markButtonTested() {
  state.setup.button = { ok: true, detail: 'Thumb button pressed. That is your "check my line" button.' }
}
