// The child's (or teacher's) settings, kept in this browser.
import { reactive, watch } from 'vue'

export type VoiceKind = 'natural' | 'system'

/** Kokoro voices (English). */
export const NATURAL_VOICES = [
  { id: 'af_heart', label: 'Heart', note: 'warm, American' },
  { id: 'af_bella', label: 'Bella', note: 'bright, American' },
  { id: 'bf_emma', label: 'Emma', note: 'British' },
  { id: 'am_michael', label: 'Michael', note: 'calm, American' },
] as const

const KEY = 'glimpse.settings'
const defaults = {
  /** Glim reads hints, answers and steps aloud by itself. */
  speakAloud: true,
  /** Natural = a neural voice running in this browser (Kokoro); system = the computer's own voice. */
  voice: 'natural' as VoiceKind,
  naturalVoice: 'af_heart' as string,
  /** 0.8 slower ... 1.2 faster */
  rate: 1,
  /** Read a line by itself when the pencil lifts (the switch on the camera page). */
  readOnLift: true,
  /** After pointing, the microphone listens for the question. */
  listenAfterPointing: true,
  /** The learner's age (0: the student's own). Decides how animations look and how Glim talks. */
  age: 0,
}

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...defaults }
  }
}

export const settings = reactive(load() as typeof defaults)

watch(settings, (s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // private mode: settings last until the tab closes
  }
})
