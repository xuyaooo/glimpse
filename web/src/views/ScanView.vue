<script lang="ts">
// The session the line photos (ui.crops) and the animation card belong to. It outlives this
// page, so coming back to the camera in the same session keeps them.
let shownSession = -1
</script>

<script setup lang="ts">
// Open camera: a whole window. Left, the live camera with the tutor drawing on it.
// Right, the digital side: what was read, whether it's right, why, and what's going on.
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Mascot from '@/components/Mascot.vue'
import CameraView from '@/components/scan/CameraView.vue'
import SheetCheck from '@/components/scan/SheetCheck.vue'
import DigitalPanel from '@/components/scan/DigitalPanel.vue'
import { log } from '@/lib/activity'
import { grab, useCamera } from '@/lib/camera'
import { askEnd, askStart, beginListening, checkSheet, cutPart, endSession, explainPart, pointAt, setDraftQuestion, startSession, state, topicLabel } from '@/lib/engine'
import { canListen, preloadListener, startListening } from '@/lib/listen'
import { warmUpListening } from '@/lib/warmup'
import { close as closePlayer, offer, player as anim } from '@/lib/player'
import { useHands, type Pt } from '@/lib/hands'
import { sheetRect, slotRect } from '@/lib/geometry'
import { useManualTriggers } from '@/lib/keys'
import { usePencilLift } from '@/lib/pencilLift'
import { preloadVoice, speakAuto, stopSpeaking } from '@/lib/speech'
import { settings } from '@/lib/settings'
import { subjectById } from '@/lib/subjects'
import { ui } from '@/lib/ui'
import { useStepPlayer } from '@/lib/useStepPlayer'
import type { EngineState, Hint } from '@/lib/types'

const router = useRouter()
const route = useRoute()
const cam = useCamera()
const video = ref<HTMLVideoElement | null>(null)
const paper = ref('paper' in route.query)
const rotated = ref(false)
// "Ask to scan when I stop writing": saved in Settings, so it stays as the child left it. Nothing
// is read by itself: when the pencil stops, "Done writing?" offers to check the line or the whole
// sheet. The scripted demo stays manual, so a stray hand movement can't skip ahead.
const autoRead = computed({
  get: () => settings.readOnLift && state.connection === 'live',
  set: (v: boolean) => (settings.readOnLift = v),
})
const flash = ref(0)
const fullscreen = ref(false)
const questionText = ref('')
/** The microphone is recording the child's question (whatever the engine says it is doing). */
const recording = ref(false)
const shownStatus = computed<EngineState>(() => (recording.value ? 'listening' : state.status))
/** Finish was pressed: the session has its summary. A new line or question starts a new session. */
const ended = ref(false)
let alive = true

const subject = computed(() => subjectById(state.subject))
const live = computed(() => !paper.value && cam.status.value === 'live')
const selected = computed(() => state.parts.find((p) => p.id === ui.selectedPartId) ?? state.parts[state.parts.length - 1] ?? null)
const teaching = computed(() => (selected.value ? (state.teachings.filter((t) => t.partId === selected.value!.id).pop() ?? null) : null))
const hint = computed(() => (selected.value ? (state.hintsByPart[selected.value.id] ?? null) : null))
// What Glim said that isn't about a line ("I can't see a new line yet", the tutor couldn't be
// reached): shown in "What I read" (with the voice off it would be missed) until a new read
// starts, a line comes, or the child picks a line.
const notice = ref<Hint | null>(null)
watch(
  () => state.hint,
  (h) => (notice.value = h && !Object.values(state.hintsByPart).some((x) => toRaw(x) === toRaw(h)) ? h : null),
)
watch(
  () => [state.parts.length, ui.selectedPartId],
  () => (notice.value = null),
)
watch(
  () => state.status,
  (st) => st === 'reading' && (notice.value = null),
)
const player = useStepPlayer(
  () => `${selected.value?.id}-${selected.value?.verdict}-${teaching.value?.iteration ?? 0}`,
  () => (teaching.value ? teaching.value.steps.length - 1 : 0),
)

// ------------------------------------------------------------------ capturing a line

// After Finish, the summarised session is over: what the child does next goes into a new one.
function resume() {
  if (ended.value && state.student) startSession(state.student.id)
}

function capture() {
  if (!state.student || state.asking || ui.summaryOpen) return
  // The reader asked "Did you write this?" about a line: show that question, it comes first.
  if (state.confirm) return void (ui.selectedPartId = state.confirm.partId)
  // A line is being read or checked: one read at a time.
  if (state.status === 'reading' || state.status === 'thinking') return
  resume()
  flash.value++
  const v = video.value
  let image: string | undefined
  if (live.value && v?.videoWidth) {
    // A real engine gets the whole frame (never cropped) and sends back the photo each line was
    // read from. The demo script shows a crop of the slot the line should be in.
    if (state.connection === 'live') image = grab(v, null, rotated.value) ?? undefined
    else ui.pendingCrop = grab(v, slotRect(sheetRect(v.videoWidth, v.videoHeight), state.parts.length + 1), rotated.value, 900, 0.9)
  }
  cutPart(image)
}

// ------------------------------------------------------------------ pointing and asking

// With the real engine and the camera: point at the paper and hold still (or press A, or the
// Ask button). The whole frame + where the finger is + the typed question go to the engine:
// the OCR model reads the page, then the tutor answers with the photo, the text and the question.
const realEngine = computed(() => live.value && state.connection === 'live')
const hands = useHands(video, {
  enabled: () => live.value && !!state.student && !ui.summaryOpen,
  rotated: () => rotated.value,
  onPoint: (tip) => realEngine.value && !anim.playing && canAsk() && ask(tip),
})

// Point (or press Ask / hold A or the mic): the photo is taken at once, then the microphone
// listens to the question; when the child stops talking, the question goes with the photo.
// A typed question is sent straight away.
let voice: { stop: () => void } | null = null
/** A question ask() sent, waiting for its answer. */
let pointing = false
/** What Glim had to say while the microphone was recording: said once it stops. */
let deferred: { text: string; lang: string } | null = null
watch(
  () => state.asking,
  (a) => !a && (pointing = false),
)
// Whether ask() would take a question now (pointing that would be refused is not "Got it!").
const canAsk = () => !!state.student && !state.asking && state.status !== 'answering' && !ui.summaryOpen && !!video.value?.videoWidth
async function ask(tip: Pt | null, { continuous = false } = {}) {
  const v = video.value
  if (!canAsk() || !v) return
  const image = grab(v, null, rotated.value)
  if (!image) return
  resume()
  flash.value++
  let text = questionText.value.trim()
  questionText.value = ''
  if (!text && canListen && (continuous || settings.listenAfterPointing)) {
    stopSpeaking() // so the microphone doesn't hear Glim
    const before = state.status
    beginListening()
    const listening = startListening(state.lang, setDraftQuestion, { continuous })
    voice = listening
    recording.value = true
    text = await listening.done
    voice = null
    recording.value = false
    // The page was left, or the session finished, while the child was talking: send nothing.
    if (!alive || ui.summaryOpen) return dropQuestion(before)
    sayDeferred()
    // Hold to talk (or A) let go without a word heard: a stray tap asks nothing. Pointing with a
    // finger still asks about the photo ("Can you help me with this?").
    if (continuous && !text.trim()) return dropQuestion(before)
  }
  pointing = true
  pointAt(image, tip, text)
}
function dropQuestion(before: EngineState) {
  deferred = null
  state.asking = false
  state.question = null
  if (state.status === 'listening') state.status = before === 'listening' ? 'watching' : before
}
function onAskStart() {
  if (ui.summaryOpen) return
  if (realEngine.value) ask(hands.recentTip(), { continuous: true })
  else {
    resume()
    askStart()
  }
}
function onAskEnd() {
  if (voice) return voice.stop()
  // The engine itself is listening (A was held on the desk, or before the camera was on):
  // letting go sends the question, as it does without the camera.
  if (!pointing) askEnd()
}

const { moving } = usePencilLift(
  video,
  () =>
    live.value &&
    autoRead.value &&
    (state.status === 'watching' || (ended.value && state.status === 'idle')) &&
    !state.asking &&
    !state.confirm &&
    !hands.busy() &&
    !anim.playing &&
    !ui.summaryOpen &&
    !sheetOpen.value,
  offerScan,
)

// ------------------------------------------------------------------ "Done writing?" and the whole sheet

const scanPrompt = ref(false)
const sheetOpen = ref(false)
let promptTimer = 0
/** The pencil stopped: ask, don't read (it goes away if writing starts again, or by itself). */
function offerScan() {
  scanPrompt.value = true
  window.clearTimeout(promptTimer)
  promptTimer = window.setTimeout(() => (scanPrompt.value = false), 25000)
}
watch(moving, (m) => m && (scanPrompt.value = false))
function closePrompt() {
  scanPrompt.value = false
  window.clearTimeout(promptTimer)
}
function checkLine() {
  closePrompt()
  capture()
}
function checkWholeSheet() {
  closePrompt()
  if (!state.student || state.asking || ui.summaryOpen || state.status === 'reading' || state.status === 'thinking') return
  resume()
  flash.value++
  sheetOpen.value = true
  const v = video.value
  checkSheet(live.value && state.connection === 'live' && v?.videoWidth ? (grab(v, null, rotated.value) ?? undefined) : undefined)
}
// the report couldn't be made (the reader or the tutor failed): Glim's message says so
watch(
  () => state.sheetChecking,
  (now, before) => before && !now && !state.sheet && (sheetOpen.value = false),
)
function explain(partId: number) {
  sheetOpen.value = false
  ui.selectedPartId = partId
  explainPart(partId)
}
onBeforeUnmount(() => window.clearTimeout(promptTimer))
// development only: open the prompt without moving a pencil (browser tests)
if (import.meta.env.DEV) (window as unknown as { __glimpseScan?: object }).__glimpseScan = { offerScan, checkWholeSheet }
useManualTriggers({ cut: capture, askStart: onAskStart, askEnd: onAskEnd })

// ------------------------------------------------------------------ reacting to the engine

// A new session (another child, or "Start a new session") starts with no line photos and no
// animation card from the one before.
watch(
  () => state.startedAt,
  (at) => {
    if (at === shownSession) return
    shownSession = at
    ui.crops = {}
    ui.pendingCrop = null
    ended.value = false
    if (anim.mode !== 'full' && (anim.mode || anim.pending)) {
      anim.pending = null
      closePlayer()
    }
  },
  { immediate: true },
)
watch(
  () => state.parts.length,
  (n, old) => {
    if (n <= (old ?? 0)) return
    const p = state.parts[n - 1]
    ui.selectedPartId = p.id
    if (p.crop) ui.pendingCrop = null
    else if (ui.pendingCrop) {
      ui.crops[p.id] = ui.pendingCrop
      ui.pendingCrop = null
    }
  },
)
// A worked solution with an animation appears as a video card on the camera, ready to play:
// it never pops up by itself. The second message for the same solution (the tutor's written
// steps) updates it without restarting it.
watch(
  () => state.steps,
  (st) => st?.scene && offer(st),
)
function finish() {
  if (ui.summaryOpen) return // already finishing (Enter on the button behind the summary)
  if (ended.value) return void (ui.summaryOpen = true) // finished already: its summary again
  voice?.stop() // a question being said now is dropped: ask() sees the summary open
  ended.value = true
  state.summary = null
  ui.summaryOpen = true
  endSession()
}

// The photo each line was read from, sent by the engine (new line, or a line that changed), or
// already there (the session's lines brought back after a reload).
watch(
  () => state.parts.map((p) => p.crop),
  () => state.parts.forEach((p) => p.crop && (ui.crops[p.id] = p.crop)),
  { immediate: true },
)
watch(
  () => state.teaching,
  (t) => t && (ui.selectedPartId = t.partId),
)
// Not over Glim telling an animation, nor over the summary. While the microphone records the
// child's question, Glim waits (it would be heard as part of the question) and speaks after.
function say(text: string, lang: string) {
  if (anim.playing || ui.summaryOpen) return
  if (recording.value) deferred = { text, lang }
  else speakAuto(text, lang)
}
function sayDeferred() {
  const d = deferred
  deferred = null
  if (d) say(d.text, d.lang)
}
watch(
  () => state.hint,
  (h) => h && say(h.text, h.lang),
)
watch(
  () => state.answer,
  (a) => a && say(a.text, a.lang),
)

// ------------------------------------------------------------------ window

function back() {
  router.push({ name: 'home' })
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !document.fullscreenElement) back()
}
function onFullscreen() {
  fullscreen.value = !!document.fullscreenElement
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.().catch(() => {})
}
async function switchCamera(id: string) {
  paper.value = false
  await cam.start(id)
}

let autoplay = 0
onMounted(async () => {
  preloadVoice()
  if (settings.listenAfterPointing) {
    preloadListener(state.lang)
    warmUpListening()
  }
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreen)
  if (!state.student && typeof route.query.student === 'string') startSession(route.query.student)
  if (!state.student) return void router.replace({ name: 'home' })
  if (state.summary || ui.summaryOpen) ended.value = true // finished on the desk
  if (!paper.value) {
    await cam.start()
    if (cam.status.value === 'live') log('camera', `Camera on: ${cam.label.value}.`, 'The video stays in this browser. Only a line you finish is read.')
  }
  // `?autoplay`: hands-free demo, a line every few seconds.
  if ('autoplay' in route.query && alive) {
    let lines = 0
    const tick = () => {
      if (!alive || lines++ >= 5 || state.confirm) return
      capture()
      autoplay = window.setTimeout(tick, 4200)
    }
    autoplay = window.setTimeout(tick, 1800)
  }
})
onBeforeUnmount(() => {
  // Leaving: the microphone stops now, and nothing more is sent from this page.
  alive = false
  voice?.stop()
  window.clearTimeout(autoplay)
  // Leaving the camera closes its animation card, and any newer one waiting to be shown.
  if (anim.mode !== 'full') {
    anim.pending = null
    closePlayer()
  }
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreen)
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
})

const STATUS: Record<string, string> = {
  idle: 'Ready',
  watching: 'Watching your paper',
  reading: 'Reading your line',
  thinking: 'Checking it',
  listening: 'Listening to your question',
  answering: 'Thinking about your question',
}
</script>

<template>
  <div class="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden" style="background: linear-gradient(180deg, #d6ecf9 0%, #eaf4fb 60%, #f4f9fd 100%)">
    <header class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
      <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-black shadow-[0_8px_20px_-14px_rgb(24_41_74/0.5)] transition-transform hover:-translate-x-0.5" @click="back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        Home
      </button>
      <div class="flex items-center gap-3">
        <Mascot :size="46" />
        <div>
          <h1 class="flex flex-wrap items-center gap-2 text-[22px] font-black leading-tight">
            Scan your paper
            <span class="inline-flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-3 text-[13px] font-black shadow-sm">
              <span class="flex size-6 items-center justify-center rounded-full" :style="{ background: subject.bg }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="subject.icon" /></svg>
              </span>
              {{ subject.name }}, {{ topicLabel(subject.topic).toLowerCase() }}
            </span>
          </h1>
          <p class="text-[14px] font-semibold text-ink-2">{{ state.student?.name }}, write on your paper, then check your line or the whole sheet.</p>
        </div>
      </div>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <label v-if="cam.devices.value.length > 1 && !paper" class="flex min-h-10 items-center gap-2 rounded-full bg-white px-3 text-[14px] font-bold shadow-sm">
          <span class="sr-only">Camera</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#0F7F76" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
          <select :value="cam.deviceId.value" class="max-w-[180px] bg-transparent outline-none" @change="switchCamera(($event.target as HTMLSelectElement).value)">
            <option v-for="d in cam.devices.value" :key="d.id" :value="d.id">{{ d.label }}</option>
          </select>
        </label>
        <button
          type="button"
          role="switch"
          :aria-checked="autoRead"
          :disabled="!live || state.connection !== 'live'"
          class="flex min-h-10 items-center gap-2.5 rounded-full bg-white px-3.5 text-[14px] font-bold shadow-sm disabled:opacity-50"
          title="Reads a line by itself when you stop writing"
          @click="autoRead = !autoRead"
        >
          <span class="relative block h-6 w-11 shrink-0 rounded-full transition-colors duration-300" :class="autoRead ? 'bg-lagoon' : 'bg-line'" aria-hidden="true">
            <span class="absolute left-0.5 top-0.5 block size-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.3,1.5,0.5,1)]" :class="autoRead ? 'translate-x-5' : 'translate-x-0'" />
          </span>
          Ask to scan when I stop writing
          <span v-if="autoRead && live" class="size-2 rounded-full transition-colors" :class="moving ? 'bg-tangerine' : 'bg-right-mark'" :title="moving ? 'Writing' : 'Still'" />
        </button>
        <button type="button" :aria-pressed="rotated" :disabled="!live" title="Turn the picture upside down" aria-label="Turn the picture upside down" class="flex size-10 items-center justify-center rounded-full bg-white shadow-sm transition-transform hover:rotate-180 disabled:opacity-50" :class="rotated ? 'text-lagoon ring-2 ring-lagoon' : ''" @click="rotated = !rotated">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /></svg>
        </button>
        <button type="button" aria-label="Settings" title="Settings: voice, listening" class="flex size-10 items-center justify-center rounded-full bg-white shadow-sm transition-transform hover:rotate-45" @click="ui.settingsOpen = true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
        <a href="/worksheet" target="_blank" class="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-3.5 text-[14px] font-bold text-ink no-underline shadow-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></svg>
          Print the sheet
        </a>
        <button type="button" :aria-label="fullscreen ? 'Leave full screen' : 'Full screen'" :title="fullscreen ? 'Leave full screen' : 'Full screen'" class="flex size-10 items-center justify-center rounded-full bg-white shadow-sm transition-transform hover:scale-110" @click="toggleFullscreen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-if="!fullscreen" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            <path v-else d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          </svg>
        </button>
      </div>
    </header>

    <main class="grid min-h-0 flex-1 gap-4 px-4 pb-3 sm:px-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(360px,1fr)]">
      <CameraView
        :stream="cam.stream.value"
        :camera="cam.status.value"
        :message="cam.message.value"
        :paper="paper"
        :rotated="rotated"
        :parts="state.parts"
        :selected-id="selected?.id ?? null"
        :teaching="selected?.verdict === 'wrong' ? teaching : null"
        :step="player.step.value"
        :question="state.question"
        :answer="state.answer"
        :asking="state.asking"
        :status="shownStatus"
        :flash="flash"
        :moving="moving"
        :auto-read="autoRead"
        :name="state.student?.name ?? ''"
        :crops="ui.crops"
        :hands="hands.hands.value"
        :tip="hands.tip.value"
        :dwell="hands.dwell.value"
        :hand-status="hands.status.value"

        @select="(id) => (ui.selectedPartId = id)"
        @video="(el) => (video = el)"
        @retry="cam.start()"
        @use-paper="paper = true"
      />
      <DigitalPanel
        :selected="selected"
        :teaching="teaching"
        :step="player.step.value"
        :crop="selected ? (ui.crops[selected.id] ?? null) : null"
        :hint="hint"
        :notice="notice"
        @step="player.go"
        @replay="player.play"
        @select="(id) => (ui.selectedPartId = id)"
      />
    </main>

    <footer class="flex flex-wrap items-center gap-3 border-t border-white/70 bg-white/75 px-4 py-3 backdrop-blur sm:px-6">
      <span role="status" class="flex items-center gap-2.5 text-[15px] font-black">
        <span class="relative flex size-3">
          <span class="absolute inline-flex size-full animate-ping rounded-full opacity-60" :class="state.asking ? 'bg-tangerine' : 'bg-lagoon-bright'" />
          <span class="relative size-3 rounded-full" :class="state.asking ? 'bg-tangerine' : 'bg-lagoon-bright'" />
        </span>
        {{ state.connection === 'offline' ? 'The tutor stopped. Restart the engine.' : STATUS[shownStatus] }}
      </span>
      <span v-if="state.connection === 'demo'" class="rounded-full bg-line-2 px-2.5 py-0.5 text-[12px] font-black text-ink-2">Demo tutor</span>
      <span class="hidden text-[13px] font-semibold text-ink-3 xl:inline">{{ realEngine ? 'Point at your paper, hold still, then say your question. W reads a line, hold A to talk, Esc goes home' : 'Keyboard: W reads a line, hold A to ask, Esc goes home' }}</span>
      <div class="ml-auto flex flex-wrap gap-2">
        <button v-if="state.parts.length || state.questions.length" type="button" class="min-h-11 rounded-xl border-2 border-line bg-white px-4 text-[14px] font-black transition-transform hover:-translate-y-0.5" title="End the session and see how it went" @click="finish">Finish</button>
        <button type="button" class="btn-lagoon min-h-11 rounded-xl px-4 text-[14px] font-black transition-transform hover:-translate-y-0.5 active:scale-95" @click="capture">Read my line now</button>
        <button type="button" class="min-h-11 rounded-xl border-2 border-lagoon-soft bg-white px-4 text-[14px] font-black text-lagoon-deep transition-transform hover:-translate-y-0.5 hover:bg-lagoon-mist active:scale-95" title="Glim checks every exercise on the sheet" @click="checkWholeSheet">Check my whole sheet</button>
        <form v-if="realEngine" class="flex min-h-11 items-center gap-1 rounded-xl border-2 border-line bg-white pl-3 pr-1" @submit.prevent="ask(hands.recentTip())">
          <label for="question" class="sr-only">Your question</label>
          <input id="question" v-model="questionText" type="text" autocomplete="off" placeholder="Your question (optional), then point" class="w-[230px] bg-transparent text-[14px] font-semibold outline-none" />
          <button type="submit" :disabled="state.asking" class="min-h-9 rounded-lg bg-tangerine px-3.5 text-[14px] font-black text-white disabled:opacity-50">{{ shownStatus === 'listening' ? 'Listening…' : state.asking ? 'Thinking…' : 'Ask' }}</button>
        </form>
        <button
          v-if="realEngine && canListen"
          type="button"
          class="flex min-h-11 select-none items-center gap-2 rounded-xl px-4 text-[14px] font-black transition-colors"
          :class="recording ? 'bg-tangerine text-white' : 'border-2 border-line bg-white'"
          title="Hold and say your question (point at the paper too)"
          @pointerdown.prevent="onAskStart"
          @pointerup="onAskEnd"
          @pointerleave="recording && onAskEnd()"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          {{ recording ? 'Listening, let go to send' : 'Hold to talk' }}
        </button>
        <button
          v-else
          type="button"
          class="min-h-11 select-none rounded-xl px-4 text-[14px] font-black transition-colors"
          :class="state.asking ? 'bg-tangerine text-white' : 'border-2 border-line bg-white'"
          @pointerdown.prevent="askStart"
          @pointerup="askEnd"
          @pointerleave="state.asking && askEnd()"
        >{{ state.status === 'answering' ? 'Thinking…' : state.asking ? 'Listening, let go to send' : 'Hold to ask' }}</button>
      </div>
    </footer>

    <!-- "Done writing?" and the whole-sheet report -->
    <SheetCheck :prompt="scanPrompt" :checking="state.sheetChecking" :report="state.sheet" :open="sheetOpen" @line="checkLine" @check="checkWholeSheet" @later="closePrompt" @close="sheetOpen = false" @explain="explain" />
  </div>
</template>
