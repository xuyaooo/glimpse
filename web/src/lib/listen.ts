// Questions by voice, understood on this computer: the microphone records until the child stops
// talking (a short silence), then Whisper (stt.worker.ts) writes it down. Nothing is sent
// anywhere to be recognised; only the text goes on to the tutor.
import { reactive } from 'vue'

export const canListen = !!navigator.mediaDevices?.getUserMedia

export const listenStatus = reactive({
  model: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  progress: 0,
  device: '',
  /** How long the last question took to write down, ms. */
  lastMs: 0,
  /** What the microphone is doing now, for the question bubble. */
  phase: 'idle' as 'idle' | 'waiting' | 'speaking' | 'writing',
  /** Loudness now, 0-1, for the sound bars. */
  level: 0,
})

const LANGUAGE: Record<string, string> = { fr: 'french', de: 'german', it: 'italian', tr: 'turkish', ar: 'arabic' }
const modelFor = (lang: string) => (lang.startsWith('en') ? 'onnx-community/whisper-base.en' : 'onnx-community/whisper-base')

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (text: string) => void>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./stt.worker.ts', import.meta.url), { type: 'module' })
  listenStatus.model = 'loading'
  worker.onmessage = (e) => {
    const m = e.data
    if (m.type === 'progress') listenStatus.progress = m.share
    else if (m.type === 'ready') Object.assign(listenStatus, { model: 'ready', device: m.device, progress: 1 })
    else if (m.type === 'failed') {
      listenStatus.model = 'failed'
      console.warn('Glimpse: speech recognition model unavailable', m.message)
    } else if (m.type === 'text' || m.type === 'error') {
      if (m.type === 'text') listenStatus.lastMs = m.ms
      else console.warn('Glimpse: speech recognition', m.message)
      pending.get(m.id)?.(m.type === 'text' ? m.text : '')
      pending.delete(m.id)
    }
  }
  return worker
}

/** Get the speech model ready in the background (the first time, it downloads). */
export function preloadListener(lang = 'en') {
  if (canListen) getWorker().postMessage({ type: 'load', model: modelFor(lang) })
}

// Development: window.__glimpseHear(audio16k) -> text, and the status
if (import.meta.env.DEV) Object.assign(window, { __glimpseHear: (a: Float32Array) => transcribe(a, 'en'), __glimpseEars: listenStatus })

/** Writes down a recording (16 kHz). */
export const transcribeAudio = (audio: Float32Array, lang = 'en') => transcribe(audio, lang)

function transcribe(audio: Float32Array, lang: string) {
  const id = nextId++
  return new Promise<string>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ type: 'hear', id, model: modelFor(lang), audio, language: LANGUAGE[lang] }, [audio.buffer])
  })
}

// Whisper sometimes "hears" these in noise, besides notes like [BLANK_AUDIO] or (static).
const NOT_SPEECH = /^(?:thank you(?: for watching)?|thanks for watching.*|you|bye|)$/i

/** What was said, without Whisper's notes on the sounds; '' if nothing else was heard. */
function speechOnly(text: string) {
  const said = text.replace(/\[[^\]]*\]|\(\s*[A-Za-z][A-Za-z' -]+\)/g, ' ').replace(/\s+/g, ' ').trim()
  const phrases = said.toLowerCase().split(/[.!?,…]+/).map((p) => p.trim())
  return phrases.every((p) => NOT_SPEECH.test(p)) ? '' : said
}

/**
 * Listens for one question. `done` gives the text when the child stops talking (or, with
 * `continuous`, when stop() is called), or '' if nothing was said within `noSpeechMs`.
 */
export function startListening(lang: string, onText: (text: string) => void, { continuous = false, noSpeechMs = 5000, silenceMs = 900, maxMs = 15000 } = {}) {
  let resolve!: (text: string) => void
  const done = new Promise<string>((r) => (resolve = r))
  let stopRequested = false
  let finish: () => void = () => (stopRequested = true)

  ;(async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (err) {
      console.warn('Glimpse: microphone', err)
      listenStatus.phase = 'idle'
      return resolve('')
    }
    let ctx: AudioContext | null = null
    let source: MediaStreamAudioSourceNode
    let proc: ScriptProcessorNode
    try {
      ctx = new AudioContext({ sampleRate: 16000 }) // Whisper wants 16 kHz
      source = ctx.createMediaStreamSource(stream)
      proc = ctx.createScriptProcessor(2048, 1, 1) // ~128 ms per chunk
    } catch (err) {
      // e.g. a browser that can't record at 16 kHz: let go of the microphone, nothing heard
      console.warn('Glimpse: microphone', err)
      stream.getTracks().forEach((t) => t.stop())
      ctx?.close().catch(() => {})
      listenStatus.phase = 'idle'
      return resolve('')
    }
    const audio = ctx
    // A page the child hasn't clicked yet can start the sound suspended: no audio would come.
    if (audio.state !== 'running') audio.resume().catch(() => {})
    const chunks: Float32Array[] = []
    let speechChunk = -1
    let lastLoud = 0
    let floor = 0
    let ended = false
    const started = performance.now()
    listenStatus.phase = 'waiting'
    // The audio's own clock ends the recording; these end it too if no audio comes at all.
    const timers = [window.setTimeout(() => finish(), maxMs + 500)]
    if (!continuous) timers.push(window.setTimeout(() => speechChunk < 0 && finish(), noSpeechMs + 500))

    finish = async () => {
      if (ended) return
      ended = true
      timers.forEach((t) => window.clearTimeout(t))
      proc.onaudioprocess = null
      proc.disconnect()
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      audio.close().catch(() => {})
      listenStatus.level = 0
      if (speechChunk < 0) {
        listenStatus.phase = 'idle'
        return resolve('')
      }
      // from a little before the first loud chunk, so the first word isn't cut
      const keep = chunks.slice(Math.max(0, speechChunk - 3))
      const recording = new Float32Array(keep.reduce((n, c) => n + c.length, 0))
      let at = 0
      for (const c of keep) {
        recording.set(c, at)
        at += c.length
      }
      listenStatus.phase = 'writing'
      let text = ''
      try {
        text = await transcribe(recording, lang)
      } catch (err) {
        console.warn('Glimpse: speech recognition', err)
      }
      listenStatus.phase = 'idle'
      const heard = speechOnly(text)
      if (heard) onText(heard)
      resolve(heard)
    }

    proc.onaudioprocess = (e) => {
      const x = new Float32Array(e.inputBuffer.getChannelData(0))
      chunks.push(x)
      let sum = 0
      for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
      const rms = Math.sqrt(sum / x.length)
      // Each chunk is judged against the room's noise before it (starting low, so a child already
      // talking when the microphone opens counts), and talking only slowly raises that level.
      const f = floor || Math.min(rms, 0.004)
      const loud = rms > Math.max(0.012, f * 3)
      floor = rms < f ? rms : loud ? f * 0.99 + rms * 0.01 : f * 0.97 + rms * 0.03
      const now = performance.now()
      listenStatus.level = Math.min(1, rms * 12)
      if (loud) {
        lastLoud = now
        if (speechChunk < 0) speechChunk = chunks.length - 1
        listenStatus.phase = 'speaking'
      }
      if (now - started > maxMs) return void finish()
      if (continuous) return
      if (speechChunk < 0 && now - started > noSpeechMs) finish()
      else if (speechChunk >= 0 && now - lastLoud > silenceMs) finish()
    }
    try {
      source.connect(proc)
      proc.connect(audio.destination) // needed for the processor to run; it outputs silence
    } catch (err) {
      console.warn('Glimpse: microphone', err)
      speechChunk = -1
      return void finish()
    }
    if (stopRequested) finish()
  })()

  return { done, stop: () => finish() }
}
