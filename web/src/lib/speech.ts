// Glim's voice.
//   Natural: Kokoro, an open neural voice running in this browser (tts.worker.ts), made sentence
//            by sentence so it starts talking quickly. English only.
//   System:  the computer's own voice, the most natural one it has (Premium / Enhanced first).
// Until the natural voice has downloaded (the first time), or if it can't run, the system voice
// speaks. Settings (voice, speed, on/off): lib/settings.ts.
import { reactive } from 'vue'
import { settings } from './settings'

const LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-US', de: 'de-CH', it: 'it-IT', tr: 'tr-TR', ar: 'ar-SA' }

export const voiceStatus = reactive({
  natural: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  /** Download progress, 0-1. */
  progress: 0,
  device: '',
  /** How long the last sentence took to make, ms. */
  lastMs: 0,
})
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__glimpseVoice = voiceStatus

// ------------------------------------------------------------------ maths, read aloud

// Emoji, with their skin tones, joiners and keycaps (else a voice says "medium skin tone").
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200D|\uFE0F|\u20E3)+/gu
const GREEK = /\\(alpha|beta|gamma|delta|Delta|epsilon|theta|lambda|mu|pi|sigma|Sigma|phi|omega|infty)(?![a-zA-Z])/g
const GREEK_WORD: Record<string, string> = { Delta: 'delta', Sigma: 'sigma', infty: 'infinity' }
const GREEK_SIGN: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', Sigma: 'Σ', phi: 'φ', omega: 'ω', infty: '∞' }
const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', ⁿ: 'n' }
const UNIT: Record<string, string> = { km: 'kilometres', m: 'metres', cm: 'centimetres', mm: 'millimetres', h: 'hour', s: 'second', min: 'minute' }
// Next to a spaced hyphen, these are maths ("x squared - 4"), so it is a minus, not a dash.
const MATHS_BEFORE = /^(?:squared|cubed|factorial|prime|pi|infinity|alpha|beta|gamma|delta|theta|lambda|sigma|phi|omega)$/i
const MATHS_AFTER = /^(?:pi|infinity|alpha|beta|gamma|delta|theta|lambda|sigma|phi|omega|sine|cosine|tangent|sin|cos|tan|log|ln)\b/i

/** LaTeX that can nest (\frac{\sqrt{3}}{2}, \frac{1}{x^{2}}), innermost first. */
function unnest(t: string, step: (t: string) => string) {
  for (let i = 0; i < 8; i++) {
    const was = t
    t = step(t)
    if (t === was) break
  }
  return t
}

/**
 * "1/(1+x)" -> "1 over 1 plus x", "x²" -> "x squared", "∫" -> "the integral of"... In another
 * language than English, LaTeX only becomes maths signs, which the computer's voice reads in that
 * language (no English words in French speech).
 */
export function speakable(text: string, lang = 'en') {
  let t = String(text || '').replace(/\$+/g, '').replace(EMOJI, '')
  t = t.replace(/\\[dt]frac/g, '\\frac').replace(/\\left|\\right/g, '').replace(/\\[,;:! ]/g, ' ')
  t = t.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g, ' $1 ')
  if (!lang.startsWith('en')) return signs(t)

  t = t.replace(GREEK, (_, g: string, at: number, s: string) => `${/\w/.test(s[at - 1] ?? '') ? ' ' : ''}${GREEK_WORD[g] ?? g}`)
  t = t.replace(/\\(?:leqslant|leq|le)(?![a-zA-Z])|<=/g, ' ≤ ').replace(/\\(?:geqslant|geq|ge)(?![a-zA-Z])|>=/g, ' ≥ ')
  t = t.replace(/\\(?:neq|ne)(?![a-zA-Z])/g, ' ≠ ').replace(/\\pm(?![a-zA-Z])/g, ' ± ').replace(/\^\s*\{?\\circ\}?/g, '°')
  t = t.replace(/\\lim_\{([^{}]*)\}/g, (_, c: string) => ` the limit as ${c.replace(/\\to(?![a-zA-Z])|->|→/g, ' tends to ')} of `)
  t = t.replace(/\\lim(?![a-zA-Z])/g, ' the limit of ')
  t = t.replace(/(?:\\int|∫)_\{?([^{}\s^]+)\}?\^\{?([^{}\s]+)\}?/g, ' the integral from $1 to $2 of ')
  t = t.replace(/\\int|∫/g, ' the integral of ')
  t = t.replace(/\\to(?![a-zA-Z])|->/g, '→').replace(/(?<![a-zA-Z])([a-zA-Z])\s*→\s*/g, '$1 tends to ')
  t = unnest(t, (s) =>
    s
      .replace(/\\sqrt\{([^{}]*)\}/g, ' the square root of $1 ')
      .replace(/\\sqrt\[\s*([^\]]*?)\s*\]\{([^{}]*)\}/g, (_, n: string, a: string) => ` the ${n === '3' ? 'cube' : n === '2' ? 'square' : `${n}th`} root of ${a} `)
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, ' $1 over $2 ')
      .replace(/\\binom\{([^{}]*)\}\{([^{}]*)\}/g, ' $1 choose $2 ')
      .replace(/\^\{\s*2\s*\}/g, ' squared ')
      .replace(/\^\{\s*3\s*\}/g, ' cubed ')
      .replace(/\^\{([^{}]*)\}/g, ' to the power of $1 '),
  )
  t = t.replace(/\\sqrt(?![a-zA-Z])/g, ' the square root of ')
  t = t.replace(/\\ln(?![a-zA-Z])|\bln\b/g, ' the natural log of ')
  t = t.replace(/\\(log|sin|cos|tan)(?![a-zA-Z])/g, ' $1 ')
  t = t.replace(/\\approx|≈/g, ' is about ')
  // f'(x) -> "f prime of x" (not 'what 't' is', not "don't")
  t = t.replace(/(?<![\w'’])([a-zA-Z])(?:''|′′|″)(?=\s*[(=])|([a-zA-Z])(?:′′|″)/g, (_, a, b) => `${a ?? b} double prime `)
  t = t.replace(/(?<![\w'’])([a-zA-Z])['′](?=\s*[(=])|([a-zA-Z])′/g, (_, a, b) => `${a ?? b} prime `)
  t = t.replace(/prime\s*\(/g, 'prime of (')
  // 5! ÷ (2! × 3!): factorials, before the signs around them become words ("That's 12!" stays)
  t = t.replace(/(?<=(?:\b[a-zA-Z]|\d|\)))!(?=\s*(?:[=×÷)+*/,;−-]|\\times|\\div|\\cdot))/g, ' factorial ')
  t = t.replace(/\\times|\\cdot|×|·/g, ' times ')
  t = t.replace(/(?<=[\w)\]²³])\s*\*\s*(?=[\w(√])/g, ' times ').replace(/\*+/g, ' ')
  t = t.replace(/(\d)\s+x\s+(?=\d)/g, '$1 times ')
  t = t.replace(/\\div|÷/g, ' divided by ')
  t = t.replace(/[⁰¹²³⁴-⁹⁻ⁿ]+/g, (s) => (s === '²' ? ' squared ' : s === '³' ? ' cubed ' : ` to the power of ${[...s].map((c) => SUPERSCRIPT[c]).join('')} `))
  t = t.replace(/\^\s*2(?!\d|\.\d)/g, ' squared ').replace(/\^\s*3(?!\d|\.\d)/g, ' cubed ')
  t = t.replace(/\^\(([^()]+)\)|\^\s*(-?\d+(?:\.\d+)?|-?[a-zA-Z]\w*)/g, (_, a, b) => ` to the power of ${a ?? b} `)
  t = t.replace(/\bdx\b/g, 'd x')
  // 60 km/h -> "60 kilometres per hour"; a slash between two words (and/or) is not "over"
  t = t.replace(/(?<=\d\s*)(km|cm|mm|m)\/(h|min|s)\b/g, (_, a: string, b: string) => `${UNIT[a]} per ${UNIT[b]}`)
  t = t.replace(/(?<=([\w)\]²³]*))\s*\/\s*(?=([\w([√]*))/g, (m, l: string, r: string) => {
    if (!l || !r) return m
    const word = (w: string) => /^[A-Za-z]{2,}$/.test(w) && !/^d[a-z]$/.test(w) // not dy/dx
    return word(l) && word(r) ? ' ' : ' over '
  })
  t = t.replace(/\|([^|()]{1,30})\|/g, ' the absolute value of $1 ')
  t = t.replace(/\b(the|a|an)\s*<\s*/gi, '$1 less-than ').replace(/\b(the|a|an)\s*>\s*/gi, '$1 greater-than ')
  t = t.replace(/\s*<\s*/g, ' is less than ').replace(/\s*>\s*/g, ' is more than ')
  t = t.replace(/\s*=\s*/g, ' equals ')
  t = t.replace(/\s*\+\s*/g, ' plus ')
  // Minus: between numbers, a spaced one (unless it's a dash: between two words, or before a
  // capitalised word as in "Step 1 - Add the tops"), a sign
  t = t.replace(/(?<=[\d)x])\s*-\s*(?=[\d(x])|\s*−\s*/g, ' minus ')
  t = t.replace(/(?<=(\S+))\s+-\s+(?=(\S+))/g, (m, l: string, r: string) =>
    (/^[A-Za-z]{2,}[,;:]?$/.test(l) && !MATHS_BEFORE.test(l.replace(/[,;:]$/, '')) && /^[A-Za-z]{2,}/.test(r) && !MATHS_AFTER.test(r)) || /^[A-Z][a-z]+/.test(r) ? m : ' minus ',
  )
  t = t.replace(/(^|[\s([≤≥≠±,:])-(?=[a-zA-Z](?![a-zA-Z])|[(√\d.])/g, '$1minus ')
  t = t.replace(/\bsin\b/g, 'sine').replace(/\bcos\b/g, 'cosine').replace(/\btan\b/g, 'tangent')
  // 1665 -> 1,665: the natural voice reads 4-digit numbers like years ("sixteen sixty-five")
  t = t.replace(/(?<![\d.,])[1-9]\d{3,}(?![\d.,]?\d)/g, (n) => Number(n).toLocaleString('en-US'))
  t = t.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}\\_]/g, ' ')
  return t.replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').trim()
}

/** LaTeX -> maths signs (√, π, ×, a/b...), for a voice that reads them in its own language. */
function signs(t: string) {
  t = t.replace(GREEK, (_, g: string) => GREEK_SIGN[g])
  t = t.replace(/\\(?:leqslant|leq|le)(?![a-zA-Z])/g, '≤').replace(/\\(?:geqslant|geq|ge)(?![a-zA-Z])/g, '≥').replace(/\\(?:neq|ne)(?![a-zA-Z])/g, '≠')
  t = t.replace(/\\pm(?![a-zA-Z])/g, '±').replace(/\\approx/g, '≈').replace(/\\times|\\cdot/g, '×').replace(/\\div/g, '÷')
  t = t.replace(/\\to(?![a-zA-Z])/g, '→').replace(/\\int/g, '∫').replace(/\\(ln|log|sin|cos|tan|lim)(?![a-zA-Z])/g, ' $1 ')
  t = unnest(t, (s) =>
    s
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\\sqrt\[\s*3\s*\]\{([^{}]*)\}/g, '∛($1)')
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${/^[\w.]+$/.test(a) ? a : `(${a})`}/${/^[\w.]+$/.test(b) ? b : `(${b})`}`)
      .replace(/\^\{\s*2\s*\}/g, '²')
      .replace(/\^\{\s*3\s*\}/g, '³')
      .replace(/\^\{([^{}]*)\}/g, '^($1)'),
  )
  t = t.replace(/\\sqrt(?![a-zA-Z])/g, '√').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}\\_]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

// Kokoro makes at most ~510 sounds at a time and drops the rest: a long sentence is cut at a
// comma (or a space). Digits count extra ("180,000" is said "one hundred eighty thousand").
const weight = (s: string) => s.length + 5 * (s.match(/\d/g)?.length ?? 0)
const LONG = 320

// Sentences, so the first one can play while the next is being made ("0.693" stays whole).
function sentences(text: string) {
  const out: string[] = []
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (out.length && out[out.length - 1].length < 24) out[out.length - 1] += ` ${s}`
    else if (s.trim()) out.push(s.trim())
  }
  return out.flatMap((whole) => {
    const pieces: string[] = []
    let s = whole
    while (weight(s) > LONG) {
      // the longest start that fits, ended at a comma if there's one in its second half
      let fit = s.length
      while (fit > 1 && weight(s.slice(0, fit)) > LONG) fit--
      const comma = Math.max(s.lastIndexOf(', ', fit), s.lastIndexOf('; ', fit), s.lastIndexOf(': ', fit))
      const cut = comma > fit / 2 ? comma + 1 : s.lastIndexOf(' ', fit)
      if (cut <= 0) break
      pieces.push(s.slice(0, cut).trim())
      s = s.slice(cut).trim()
    }
    return [...pieces, s]
  })
}

// ------------------------------------------------------------------ the computer's own voice

const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo\b|reed|rocko|sandy|shelley/i

function bestSystemVoice(lang: string) {
  const want = (LOCALE[lang] ?? lang).toLowerCase()
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -Infinity
  for (const v of speechSynthesis.getVoices()) {
    const vl = v.lang.replace('_', '-').toLowerCase()
    if (!vl.startsWith(want.slice(0, 2))) continue
    let score = vl === want ? 2 : 0
    if (/premium/i.test(v.name)) score += 6
    if (/enhanced|natural|neural/i.test(v.name)) score += 5
    if (/^google/i.test(v.name)) score += 3
    if (/samantha|ava|zoe|allison|susan|serena|daniel|karen|moira|tessa/i.test(v.name)) score += 1
    if (NOVELTY.test(v.name)) score -= 20
    if (score > bestScore) [best, bestScore] = [v, score]
  }
  return best
}
if ('speechSynthesis' in window) speechSynthesis.getVoices() // Chrome loads them lazily

function speakSystem(text: string, lang: string) {
  return new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = LOCALE[lang] ?? lang
    const v = bestSystemVoice(lang)
    if (v) u.voice = v
    u.rate = 0.95 * settings.rate
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
  })
}

// ------------------------------------------------------------------ the natural voice

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (audio: { data: Float32Array; rate: number } | null) => void>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
  voiceStatus.natural = 'loading'
  worker.onmessage = (e) => {
    const m = e.data
    if (m.type === 'progress') voiceStatus.progress = m.share
    else if (m.type === 'ready') Object.assign(voiceStatus, { natural: 'ready', device: m.device, progress: 1 })
    else if (m.type === 'failed') {
      voiceStatus.natural = 'failed'
      console.warn('Glimpse: natural voice unavailable', m.message)
    } else if (m.type === 'audio' || m.type === 'error') {
      if (m.type === 'audio') voiceStatus.lastMs = m.ms
      else console.warn('Glimpse: natural voice', m.message)
      pending.get(m.id)?.(m.type === 'audio' ? { data: m.data, rate: m.rate } : null)
      pending.delete(m.id)
    }
  }
  worker.postMessage({ type: 'load' })
  return worker
}

/** Start getting the natural voice ready in the background (the first time, it downloads). */
export function preloadVoice() {
  if (settings.voice === 'natural') getWorker()
}

// Development: window.__glimpseSynth(text) -> { data, rate } (to test speech recognition)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__glimpseSynth = (text: string) => synth(text)

/** Makes speech without playing it: { data, rate }, or null. */
export const synthesize = (text: string) => synth(text)

function synth(text: string) {
  const id = nextId++
  return new Promise<{ data: Float32Array; rate: number } | null>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ type: 'say', id, text, voice: settings.naturalVoice, speed: settings.rate })
  })
}

let ctx: AudioContext | null = null
let playing: AudioBufferSourceNode[] = []
let token = 0

// Resolves when the last sentence has finished playing (or speaking stopped).
async function speakNatural(text: string, lang: string, my: number): Promise<void> {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
  const parts = sentences(text)
  const jobs = parts.map(synth) // made in order by the worker; each plays as soon as it's ready
  let at = 0
  let last: AudioBufferSourceNode | null = null
  for (let i = 0; i < jobs.length; i++) {
    const audio = await jobs[i]
    if (my !== token) return
    if (!audio) {
      // The sentence already playing finishes first, then the computer's voice says the rest.
      const left = (at - 0.15 - ctx.currentTime) * 1000
      if (last && left > 0)
        await new Promise<void>((resolve) => {
          const id = window.setTimeout(resolve, left)
          stoppers.push(() => {
            window.clearTimeout(id)
            resolve()
          })
        })
      if (my !== token) return
      playing = []
      return speakSystem(parts.slice(i).join(' '), lang)
    }
    const buffer = ctx.createBuffer(1, audio.data.length, audio.rate)
    buffer.copyToChannel(audio.data as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    at = Math.max(at, ctx.currentTime + 0.03)
    src.start(at)
    at += buffer.duration + 0.15 // a breath between sentences
    playing.push(src)
    last = src
  }
  const end = last
  if (!end) return
  await new Promise<void>((resolve) => {
    end.onended = () => resolve()
    stoppers.push(resolve)
  })
  playing = []
}
let stoppers: (() => void)[] = []

// ------------------------------------------------------------------ speaking

/**
 * Say it now (a "Hear it" button). Resolves when it has been said: true if all of it was said,
 * false if other speech (or stopSpeaking) cut it off.
 */
export function speak(text: string, lang: string): Promise<boolean> {
  stopSpeaking()
  const said = speakable(text, lang)
  if (!said) return Promise.resolve(true)
  const my = ++token
  const natural = settings.voice === 'natural' && lang.startsWith('en') && voiceStatus.natural !== 'failed'
  let saying: Promise<void>
  if (natural && voiceStatus.natural === 'ready') saying = speakNatural(said, lang, my).catch(() => (my === token ? speakSystem(said, lang) : undefined))
  else {
    if (natural) getWorker() // still downloading: the system voice speaks this time
    saying = speakSystem(said, lang)
  }
  return saying.then(() => my === token)
}

/** Changes whenever speech starts or stops: someone else spoke if it moved. */
export const speechTurn = () => token

/**
 * For animations: says it (if Glim talks) and resolves when done, so the next step can follow
 * the voice. With the voice off, waits about as long as it takes to read. False if other speech
 * cut it off.
 */
export function narrate(text: string, lang: string): Promise<boolean> {
  if (settings.speakAloud) return speak(text, lang)
  return new Promise((r) => window.setTimeout(() => r(true), Math.max(1800, speakable(text, lang).length * 60)))
}

/** Said by itself (a new hint, an answer, the next step): only when "Read aloud" is on. */
export function speakAuto(text: string, lang: string) {
  if (settings.speakAloud) void speak(text, lang)
}

export function stopSpeaking() {
  token++
  stoppers.forEach((r) => r())
  stoppers = []
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  playing.forEach((s) => {
    try {
      s.stop()
    } catch {
      // already ended
    }
  })
  playing = []
}
